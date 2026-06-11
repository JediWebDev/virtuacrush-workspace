// Scene composer: turns sim state into a concrete, engine-authoritative opening
// scene — time, weather, setting, mutable details, outfit, and who else is
// around. Two renderings of the same object:
//   renderSceneHeader()     -> VN-style prose narration shown to the user
//   renderSceneFactsBlock() -> compact facts block injected into the LLM prompt
// Pure + seeded: the same inputs always compose the same scene.
import { getLocation } from '../inworld/scenes';
import type { DailyState } from '../db/story_util';
import type { SceneState, ScenePhase } from '../db/scene_util';
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
  FIRST_MEET_HOOKS,
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
  locationSlug: string | null; // venue (on_date) or planned venue (planning)
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
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  if (p.phase === 'on_date' && p.scene.location) {
    const loc = getLocation(p.scene.location);
    locationSlug = p.scene.location;
    setting = loc ? `together ${loc.description}` : 'out together';
    details = loc ? [loc.cues, ...pickSome(VENUE_DETAILS[loc.kind] ?? [], 1, r)] : [];
  } else if (p.phase === 'planning' && p.scene.plannedLocation) {
    const loc = getLocation(p.scene.plannedLocation);
    locationSlug = p.scene.plannedLocation;
    setting = `at her place getting ready — you two are meeting ${loc ? loc.description : 'up'} soon`;
    details = pickSome(HOME_DETAILS, 1, r);
  } else {
    const props = pickSome(HOME_PROPS, 2, r);
    setting = `at her place, ${props.join(' and ')} in frame of the story`;
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
    activity: p.state.activity || 'taking it easy',
    cast,
    firstMeeting: Boolean(p.firstMeeting),
    meetHook: p.firstMeeting ? pickFrom(FIRST_MEET_HOOKS, r) : undefined,
  };
}

/** VN-style opening narration rendered to the user at chat open. */
export function renderSceneHeader(c: SceneComposition, displayName: string): string {
  const bits: string[] = [];
  bits.push(`${c.timeLabel} — ${c.weather}.`);
  if (c.firstMeeting) {
    // First encounter: set up the meet-cute, then place her in the world.
    bits.push(`${c.meetHook ?? `You and ${displayName} just matched`}.`);
    bits.push(`Right now ${displayName} is ${c.setting.replace(' in frame of the story', '')}, ${c.activity}.`);
    if (c.details.length) bits.push(`${c.details.join('; ')}.`);
    bits.push(`She's in ${c.outfit}.`);
    bits.push(`You've never spoken before — this is where it starts.`);
    return bits.join(' ');
  }
  if (c.phase === 'on_date') {
    bits.push(`You're ${c.setting} with ${displayName}.`);
  } else if (c.phase === 'planning') {
    bits.push(`${displayName} is ${c.setting}.`);
  } else {
    bits.push(`${displayName} is ${c.setting.replace(' in frame of the story', '')}, ${c.activity}.`);
  }
  if (c.details.length) bits.push(`${c.details.join('; ')}.`.replace(/\.\.$/, '.'));
  bits.push(`She's in ${c.outfit}.`);
  for (const m of c.cast) {
    bits.push(`${m.name} — her ${m.role} — is there too, and ${m.agenda}.`);
  }
  return bits.join(' ');
}

/** Compact, authoritative facts block for the LLM prompt. */
export function renderSceneFactsBlock(c: SceneComposition, displayName: string): string {
  const lines: string[] = [
    `\n\n=== SCENE FACTS (engine-authoritative — never contradict these) ===`,
    `Time: ${c.timeLabel}. Weather: ${c.weather}.`,
    `${displayName} is ${c.setting}; she was ${c.activity}.`,
    c.details.length ? `Scene details: ${c.details.join('; ')}.` : '',
    `She is wearing ${c.outfit} — do not change or re-invent her outfit this scene.`,
  ];
  if (c.firstMeeting) {
    lines.push(
      `FIRST MEETING: You and the player have NEVER spoken before — ${c.meetHook?.toLowerCase() ?? 'you just matched on the app'}. ` +
        `There is no shared history: no past conversations, dates, nicknames, or inside jokes — do not invent any. ` +
        `Play genuine first-impressions energy: curious, feeling them out, a little guarded but interested.`,
    );
  }
  if (c.cast.length) {
    for (const m of c.cast) {
      lines.push(
        `ALSO PRESENT: ${m.name}, her ${m.role} — ${m.vibe}. Right now she ${m.agenda}. ` +
          `Voice ${m.name} ONLY via [${m.name.toUpperCase()}] tagged lines; she can interject, react, or be overheard. ` +
          `She is real and persistent — never rename her or swap her for someone else.`,
      );
    }
  } else {
    lines.push(`No one else is present. Do not invent other people, pets, or visitors this scene.`);
  }
  return lines.filter(Boolean).join('\n');
}
