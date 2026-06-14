// Scene composer: turns sim state into a concrete, engine-authoritative opening
// scene -- time, weather, setting, mutable details, outfit, and who else is
// around. Two renderings of the same object:
//   renderSceneHeader()     -> VN-style prose narration shown to the user
//   renderSceneFactsBlock() -> compact facts block injected into the LLM prompt
// Pure + seeded: the same inputs always compose the same scene.
import { getLocation } from '../inworld/scenes';
import type { DailyState } from '../db/story_util';
import type { SceneState, ScenePhase } from '../db/scene_util';
import { planDisruptions, type PlannedDisruption } from './interruptions';
import {
  rng,
  pickFrom,
  pickSome,
  WEATHER_POOL,
  HOME_PROPS,
  HOME_DETAILS,
  VENUE_DETAILS,
  OUTFITS,
  styleFor,
  outfitContextFor,
  friendFor,
  FRIEND_AGENDAS,
  MEET_HOOK_BY_CHARACTER,
  pronounsFor,
} from './scene_registry';

export interface SceneCastMember {
  name: string;
  role: string;   // relationship to the companion ("roommate")
  vibe: string;   // one-line persona
  agenda: string; // why she's here / what she wants this scene
}

export interface SceneComposition {
  composedAt: string;          // ISO timestamp
  forDate: string;             // YYYY-MM-DD the scene was composed for
  phase: ScenePhase;
  locationSlug: string | null; // venue slug when on_date
  timeLabel: string;           // "Tuesday evening, just past 9"
  weather: string;
  setting: string;             // one-line where-she-is
  details: string[];           // mutable scene details (1-2)
  outfit: string;
  activity: string;            // from the daily story state
  cast: SceneCastMember[];     // others present (besides companion + user)
  /** True only for the very first conversation between this user + character. */
  firstMeeting?: boolean;
  /** How the match happened (first meetings only). */
  meetHook?: string;
  /** Pre-rolled mid-scene disruption budget (fired by the chat loop). */
  disruptions?: PlannedDisruption[];
  /** Ids of disruptions that already fired this scene. */
  firedDisruptions?: string[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Daily-engine activities can contradict the composed scene ("stealing a
// lipstick from a high-end store" while she's home at 2 AM) or leak engine
// phrasing ("...to annoy the user"). Reject those and fall back to a calm,
// hour-appropriate home activity.
const AWAY_HINTS =
  /\b(steal|shoplift|shopping|at (the|a)\b|store|mall|gym|class|driving|out with|heading|errand|hik(e|ing)|club|bar\b|restaurant|caf[eé]|concert|beach|park\b|office|commut)/i;
const ENGINE_LEAK = /\b(the user|the player)\b/i;
const HOME_FALLBACK_ACTIVITIES: Record<'day' | 'evening' | 'late', readonly string[]> = {
  day: ['half-watching something', 'scrolling on a phone', 'picking at a late breakfast', 'tidying up without much conviction'],
  evening: ['winding down on the phone', 'half-watching something', 'picking at leftover takeout', 'curled up scrolling'],
  late: ['up way too late, scrolling', 'fighting sleep and losing', 'watching something with the volume low'],
};

/** Sanitized activity line that can't contradict the composed setting. */
export function sceneActivity(raw: string, hour: number, atHome: boolean, r: () => number): string {
  let a = (raw ?? '').trim().replace(/[.!?\s]+$/, '');
  if (a) a = a.charAt(0).toLowerCase() + a.slice(1);
  const incompatible = !a || ENGINE_LEAK.test(a) || (atHome && AWAY_HINTS.test(a));
  if (!incompatible) return a;
  const slot = hour >= 23 || hour < 6 ? 'late' : hour >= 18 ? 'evening' : 'day';
  return pickFrom(HOME_FALLBACK_ACTIVITIES[slot], r);
}

function timeLabelFor(now: Date): string {
  const day = DAY_NAMES[now.getDay()];
  const h = now.getHours();
  const daypart =
    h < 5 ? 'deep in the night' :
    h < 12 ? 'morning' :
    h < 17 ? 'afternoon' :
    h < 21 ? 'evening' : 'late night';
  const h12 = ((h + 11) % 12) + 1;
  return `${day} ${daypart}, around ${h12} ${h < 12 ? 'AM' : 'PM'}`;
}

export interface ComposeParams {
  characterId: string;
  displayName: string;
  phase: ScenePhase;
  scene: SceneState;
  state: DailyState;
  now: Date;
  forDate: string; // YYYY-MM-DD (sim day this composition belongs to)
  seed: number;
  /** First conversation ever between this user and character. */
  firstMeeting?: boolean;
}

export function composeScene(p: ComposeParams): SceneComposition {
  const r = rng(p.seed);
  const weather = pickFrom(WEATHER_POOL, r);
  const hour = p.now.getHours();
  const outfit = pickFrom(OUTFITS[styleFor(p.characterId)][outfitContextFor(p.phase, hour)], r);

  let setting: string;
  let details: string[];
  let locationSlug: string | null = null;
  const cast: SceneCastMember[] = [];

  const pro = pronounsFor(p.characterId);
  if (p.phase === 'on_date' && p.scene.location) {
    const loc = getLocation(p.scene.location);
    locationSlug = p.scene.location;
    setting = loc ? `together ${loc.description}` : 'out together';
    details = loc ? [loc.cues, ...pickSome(VENUE_DETAILS[loc.kind] ?? [], 1, r)] : [];
  } else {
    const props = pickSome(HOME_PROPS, 2, r);
    setting = `at ${pro.possessive} place, ${props.join(' and ')} in frame of the story`;
    details = pickSome(HOME_DETAILS, 2, r);

    // A friend may be over (home scenes only): canonical identity, rolled
    // presence + agenda. The friend is an engine fact the LLM can voice but
    // never rename or replace. First meetings stay one-on-one.
    if (!p.firstMeeting && r() < 0.35) {
      const friend = friendFor(p.characterId);
      cast.push({ ...friend, agenda: pickFrom(FRIEND_AGENDAS, r) });
    }
  }

  return {
    composedAt: p.now.toISOString(),
    forDate: p.forDate,
    phase: p.phase,
    locationSlug,
    timeLabel: timeLabelFor(p.now),
    weather,
    setting,
    details,
    outfit,
    activity: sceneActivity(p.state.activity, hour, p.phase !== 'on_date', r),
    cast,
    firstMeeting: Boolean(p.firstMeeting),
    meetHook: p.firstMeeting
      ? (MEET_HOOK_BY_CHARACTER[p.characterId] ?? 'You matched online and it clicked immediately')
      : undefined,
    disruptions: planDisruptions(r, {
      phase: p.phase,
      hasFriend: cast.length > 0,
      firstMeeting: Boolean(p.firstMeeting),
    }),
    firedDisruptions: [],
  };
}

/** VN-style opening narration rendered to the user at chat open. */
export function renderSceneHeader(c: SceneComposition, displayName: string, characterId = ''): string {
  const pro = pronounsFor(characterId);
  const bits: string[] = [];
  if (c.firstMeeting) {
    // First encounter: skip time/weather — the meet hook sets the scene entirely.
    if (c.meetHook) {
      bits.push(`${c.meetHook.replace(/\.+$/, '')}.`);
    }
    return bits.join(' ');
  }
  bits.push(`${c.timeLabel} -- ${c.weather}.`);
  if (c.phase === 'on_date') {
    bits.push(`You're ${c.setting} with ${displayName}.`);
  } else {
    bits.push(`${displayName} is ${c.setting.replace(' in frame of the story', '')}, ${c.activity}.`);
  }
  if (c.details.length) bits.push(`${c.details.join('; ')}.`.replace(/\.\.$/, '.'));
  bits.push(`${pro.subjectCap}'s in ${c.outfit}.`);
  for (const m of c.cast) {
    bits.push(`${m.name} -- ${pro.possessive} ${m.role} -- is there too, and ${m.agenda}.`);
  }
  return bits.join(' ');
}

/** Compact, authoritative facts block for the LLM prompt. */
export function renderSceneFactsBlock(c: SceneComposition, displayName: string, characterId = ''): string {
  const pro = pronounsFor(characterId);
  const lines: string[] = [
    `\n\n=== SCENE FACTS (engine-authoritative -- never contradict these) ===`,
    `Time: ${c.timeLabel}. Weather: ${c.weather}.`,
    `${displayName} is ${c.setting}; ${pro.subject} was ${c.activity}.`,
    c.details.length ? `Scene details: ${c.details.join('; ')}.` : '',
    `${pro.subjectCap} is wearing ${c.outfit} -- do not change or re-invent ${pro.possessive} outfit this scene.`,
  ];
  if (c.firstMeeting) {
    const meetScenario = c.meetHook?.toLowerCase() ?? 'you just met for the first time';
    lines.push(
      `FIRST MEETING: You and the player have NEVER spoken before -- ${meetScenario}. ` +
        `There is no shared history: no past conversations, dates, nicknames, or inside jokes -- do not invent any. ` +
        `Play genuine first-impressions energy: curious, feeling them out, a little guarded but interested.`,
    );
  } else if (c.cast.length) {
    for (const m of c.cast) {
      // Friends are always female (drawn from FRIEND_NAMES which are all female).
      lines.push(
        `ALSO PRESENT: ${m.name}, ${pro.possessive} ${m.role} -- ${m.vibe}. Right now ${m.name} ${m.agenda}. ` +
          `Voice ${m.name} ONLY via [${m.name.toUpperCase()}] tagged lines; she can interject, react, or be overheard. ` +
          `She is real and persistent -- never rename her or swap her for someone else.`,
      );
    }
  }
  return lines.filter(Boolean).join('\n');
}
