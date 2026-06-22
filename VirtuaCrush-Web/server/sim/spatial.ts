// Engine-owned spatial state — venue slugs, optional rooms, co-presence.
// The LLM narrates; this module decides where actors are for prompts and persistence.

import type { PlayerIntent } from './intent';
import { getLocation, resolveVenueSlug } from '../inworld/locations';
import type { SceneSnapshot } from '../inworld/scene_snapshot';

export interface PlaceRoom {
  id: string;
  label: string;
}

export interface VenuePlaces {
  venueSlug: string;
  defaultRoomId: string;
  rooms: PlaceRoom[];
}

/** Authored room graph per venue (expand as needed). */
export const VENUE_PLACES: Record<string, VenuePlaces> = {
  player_home: {
    venueSlug: 'player_home',
    defaultRoomId: 'living_room',
    rooms: [
      { id: 'garage', label: 'garage' },
      { id: 'living_room', label: 'living room' },
      { id: 'kitchen', label: 'kitchen' },
      { id: 'bedroom', label: 'bedroom' },
    ],
  },
};

const ROOM_IN_ACTION_RE =
  /\b(?:in(?:to)?|inside|within)\s+(?:the\s+)?(garage|living\s+room|kitchen|bedroom|bathroom|hallway|foyer|couch|backseat|car)\b/i;

const GO_HOME_RE =
  /\b(head(ing)?\s+(back\s+)?home|go(ing)?\s+home|leave|left|exit(ed)?|depart(ed)?|I'm\s+out\s+of\s+here|back\s+to\s+(my|the)\s+place)\b/i;

const GO_VENUE_RE =
  /\b(let'?s\s+(?:go|head|hit|meet)|go(?:ing)?\s+to(?!\s+(?:take|get|have|try|need|want|make|see|pull|remove|drink|untie|cut|bring|give|tell|ask|be|start|finish|keep|let))\s+|head(?:ing)?\s+to|take\s+me\s+to|meet\s+me\s+at|meet\s+at|walk\s+to|drive\s+to|swing\s+by)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i;

const AT_LOCATION_RE =
  /\b(I'?m|we'?re|we\s+are)\s+(?:already\s+)?(?:at|in|inside)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i;

const CO_PRESENT_ACTION_RE =
  /\b(carry|carried|bring|brought|pick\s+up|picked\s+up|lay|laid|place|placed|inside\s+to|into\s+my|bridal|backseat|couch|living\s+room|garage)\b/i;

export interface SpatialPatch {
  venueSlug?: string | null;
  roomId?: string | null;
  coPresent?: boolean;
  /** Display label derived by engine — not LLM free text. */
  location?: string;
}

function isPlausibleLocationPhrase(phrase: string): boolean {
  const t = phrase.trim().toLowerCase();
  if (!t || t.length < 3) return false;
  if (/\b(gag|tape|mouth|lips|restraints?|zip\s*-?\s*ties?|drink|scotch|understood)\b/.test(t)) return false;
  if (/^(take|pull|remove|get|have|try|need|want|make|see|cut|untie)\b/.test(t)) return false;
  return true;
}

function locationPhraseFromMessage(message: string): string | null {
  const go = GO_VENUE_RE.exec(message);
  if (go?.[2]?.trim()) {
    const phrase = go[2].trim();
    return isPlausibleLocationPhrase(phrase) ? phrase : null;
  }
  const at = AT_LOCATION_RE.exec(message);
  if (at?.[2]?.trim()) {
    const phrase = at[2].trim();
    return isPlausibleLocationPhrase(phrase) ? phrase : null;
  }
  return null;
}

function normalizeRoomToken(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (t === 'couch' || t === 'backseat') return 'living_room';
  if (t === 'car') return 'garage';
  return t || null;
}

export function inferRoomFromMessage(message: string, venueSlug: string | null): string | null {
  if (!venueSlug || !VENUE_PLACES[venueSlug]) return null;
  const m = ROOM_IN_ACTION_RE.exec(message);
  if (!m?.[1]) return null;
  const roomId = normalizeRoomToken(m[1]);
  const venue = VENUE_PLACES[venueSlug]!;
  if (roomId && venue.rooms.some((r) => r.id === roomId)) return roomId;
  return null;
}

export function formatSpatialLocation(venueSlug: string | null, roomId: string | null): string {
  if (!venueSlug) return '';
  const venue = getLocation(venueSlug);
  const base = venue?.name ?? venueSlug.replace(/_/g, ' ');
  if (!roomId) return base;
  const place = VENUE_PLACES[venueSlug];
  const room = place?.rooms.find((r) => r.id === roomId);
  if (room) return `${base} — ${room.label}`;
  return `${base} — ${roomId.replace(/_/g, ' ')}`;
}

export function normalizeSnapshotSpatial(snap: {
  location: string;
  venueSlug?: string | null;
  roomId?: string | null;
  coPresent: boolean;
}): void {
  if (snap.venueSlug === undefined && snap.location.trim()) {
    snap.venueSlug = resolveVenueSlug(snap.location);
  }
  if (snap.venueSlug && !snap.roomId) {
    const place = VENUE_PLACES[snap.venueSlug];
    if (place) snap.roomId = place.defaultRoomId;
  }
  if (snap.venueSlug) {
    snap.location = formatSpatialLocation(snap.venueSlug, snap.roomId ?? null);
  }
}

/** Resolve travel / co-presence from user text and classified movement intent. */
export function resolveSpatialFromInput(opts: {
  message: string;
  intent?: PlayerIntent;
  prior: SceneSnapshot | null;
  companionName: string;
}): SpatialPatch {
  const patch: SpatialPatch = {};
  const message = opts.message;
  const prior = opts.prior;

  if (GO_HOME_RE.test(message)) {
    patch.venueSlug = null;
    patch.roomId = null;
    patch.coPresent = false;
    patch.location = getLocation('player_home')?.name ?? 'Your Place';
    return patch;
  }

  const phrase = locationPhraseFromMessage(message);
  if (phrase) {
    const slug = resolveVenueSlug(phrase);
    if (slug) {
      patch.venueSlug = slug;
      patch.roomId = VENUE_PLACES[slug]?.defaultRoomId ?? null;
      patch.coPresent = true;
      patch.location = formatSpatialLocation(slug, patch.roomId ?? null);
    }
  }

  if (opts.intent?.type === 'movement') {
    if (opts.intent.subtype === 'leave') {
      patch.venueSlug = null;
      patch.roomId = null;
      patch.coPresent = false;
      patch.location = getLocation('player_home')?.name ?? 'Your Place';
      return patch;
    }
    const target = (opts.intent.target ?? opts.intent.detail ?? '').trim();
    if (target && !/^venue$/i.test(target)) {
      const slug = resolveVenueSlug(target);
      if (slug) {
        patch.venueSlug = slug;
        patch.roomId = VENUE_PLACES[slug]?.defaultRoomId ?? null;
        patch.coPresent = true;
        patch.location = formatSpatialLocation(slug, patch.roomId ?? null);
      }
    }
  }

  const venue = patch.venueSlug ?? prior?.venueSlug ?? null;
  const room = inferRoomFromMessage(message, venue);
  if (room) {
    patch.roomId = room;
    if (venue) patch.location = formatSpatialLocation(venue, room);
  }

  if (CO_PRESENT_ACTION_RE.test(message) && /\b(home|garage|couch|inside|apartment|place)\b/i.test(message)) {
    patch.coPresent = true;
    if (!patch.venueSlug && !prior?.venueSlug) {
      patch.venueSlug = 'player_home';
      patch.roomId = patch.roomId ?? inferRoomFromMessage(message, 'player_home') ?? VENUE_PLACES.player_home.defaultRoomId;
      patch.location = formatSpatialLocation(patch.venueSlug, patch.roomId);
    }
  }

  return patch;
}
