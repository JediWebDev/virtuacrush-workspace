// Timed dialogue-choice orchestration for the dating loop. Three kinds:
//   'date' — where to go / what to do together (moves the scene),
//   'bill' — who pays at a paid venue (humorous, affinity effect),
//   'goal' — the rarer goal beat (advances progress, may create a social post).
// Server is authoritative on the deadline and all effects. Everything fails soft.
import { pool } from './pool';
import { getCharacter } from '../inworld/characters';
import { generateDateChoice, generateBillChoice, generateChoice } from '../inworld/choice_engine';
import { getSituation, getScene, setScene, bumpGoalProgress } from './state';
import { incrementAffinity } from './affinity';
import { createPost } from './posts';
import { getLocation, isPaidLocation, coerceDateLocation } from '../inworld/scenes';
import {
  chooseChoiceKind,
  isGoalBeatDue,
  billAffinity,
  CHOICE_DATE_AFFINITY,
  type ChoiceKind,
} from './scene_util';
import {
  effectsForOption,
  isExpired,
  CHOICE_TTL_SECONDS,
  CHOICE_TIMEOUT_AFFINITY,
  type ChoiceOption,
} from './choice_util';

/** Shape sent to the client — labels + kind; reactions stay server-side. */
export interface ChoiceDTO {
  id: string;
  kind: ChoiceKind;
  prompt: string;
  options: { label: string }[];
  expiresAt: string;
  ttlSeconds: number;
}

interface ChoiceRow {
  id: string;
  character_id: string;
  kind: ChoiceKind;
  prompt: string;
  options: ChoiceOption[];
  timeout_reaction: string;
  status: 'pending' | 'chosen' | 'timed_out';
  expires_at: string;
}

const ROW_COLS = `id, character_id, kind, prompt, options, timeout_reaction, status, expires_at`;

function toDTO(row: ChoiceRow): ChoiceDTO {
  return {
    id: String(row.id),
    kind: row.kind,
    prompt: row.prompt,
    options: row.options.map((o) => ({ label: o.label })),
    expiresAt: new Date(row.expires_at).toISOString(),
    ttlSeconds: CHOICE_TTL_SECONDS,
  };
}

async function loadRow(userId: string, choiceId: string): Promise<ChoiceRow | null> {
  const { rows } = await pool.query<ChoiceRow>(
    `SELECT ${ROW_COLS} FROM dialogue_choices WHERE id = $1 AND user_id = $2`,
    [choiceId, userId],
  );
  return rows[0] ?? null;
}

async function markTimedOut(id: string): Promise<void> {
  await pool.query(`UPDATE dialogue_choices SET status = 'timed_out' WHERE id = $1`, [id]);
}

export async function getActiveChoice(
  userId: string,
  characterId: string,
): Promise<ChoiceDTO | null> {
  const { rows } = await pool.query<ChoiceRow>(
    `SELECT ${ROW_COLS} FROM dialogue_choices
     WHERE user_id = $1 AND character_id = $2 AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [userId, characterId],
  );
  const row = rows[0];
  if (!row) return null;
  if (isExpired(new Date(row.expires_at).getTime())) {
    await markTimedOut(row.id);
    return null;
  }
  return toDTO(row);
}

/**
 * Generates and stores a new pending choice (date / bill / goal) appropriate to
 * the current scene, if there isn't already an active one.
 */
export async function maybeCreateChoice(
  userId: string,
  characterId: string,
  userMessageCount: number,
): Promise<ChoiceDTO | null> {
  if (await getActiveChoice(userId, characterId)) return null;

  let displayName: string;
  try {
    displayName = getCharacter(characterId).displayName;
  } catch {
    return null;
  }

  const { state, scene } = await getSituation(userId, characterId);
  const locationKind = getLocation(scene.location)?.kind ?? null;
  const preferGoal = scene.mode === 'apart' && isGoalBeatDue(userMessageCount);
  const kind = chooseChoiceKind({ mode: scene.mode, locationKind, billPending: scene.billPending, preferGoal });

  const generated =
    kind === 'bill'
      ? await generateBillChoice({ characterId, displayName, locationSlug: scene.location ?? 'restaurant' })
      : kind === 'goal'
        ? await generateChoice({
            characterId,
            displayName,
            activity: state.activity,
            mood: state.mood,
            goalProgress: state.goalProgress,
          })
        : await generateDateChoice({ characterId, displayName, activity: state.activity, mood: state.mood });

  if (!generated) return null;

  const expiresAt = new Date(Date.now() + CHOICE_TTL_SECONDS * 1000).toISOString();
  const { rows } = await pool.query<ChoiceRow>(
    `INSERT INTO dialogue_choices
       (user_id, character_id, kind, prompt, options, timeout_reaction, status, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending', $7)
     RETURNING ${ROW_COLS}`,
    [userId, characterId, kind, generated.prompt, JSON.stringify(generated.options), generated.timeoutReaction, expiresAt],
  );
  return toDTO(rows[0]);
}

export interface SelectResult {
  ok: boolean;
  error?: 'not_found' | 'already_resolved' | 'invalid_option';
  timedOut?: boolean;
  reaction?: string;
  advancedGoal?: boolean;
  posted?: boolean;
  sceneChanged?: boolean; // hint the client to refetch scene state
  affinityScore?: number;
  goalProgress?: number;
}

/** Resolves a choice by the user's selection, applying kind-specific effects. */
export async function selectChoice(
  userId: string,
  choiceId: string,
  optionIndex: number,
): Promise<SelectResult> {
  const row = await loadRow(userId, choiceId);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') return { ok: false, error: 'already_resolved' };

  const characterId = row.character_id;

  if (isExpired(new Date(row.expires_at).getTime())) {
    await markTimedOut(row.id);
    const affinityScore = await incrementAffinity(userId, characterId, CHOICE_TIMEOUT_AFFINITY);
    return { ok: true, timedOut: true, reaction: row.timeout_reaction, affinityScore };
  }

  if (optionIndex !== 0 && optionIndex !== 1) return { ok: false, error: 'invalid_option' };
  const option = row.options[optionIndex];
  if (!option) return { ok: false, error: 'invalid_option' };

  await pool.query(
    `UPDATE dialogue_choices SET status = 'chosen', chosen_index = $2 WHERE id = $1`,
    [row.id, optionIndex],
  );

  // --- date: move the scene to the chosen venue ---
  if (row.kind === 'date') {
    const location = coerceDateLocation(option.location);
    const affinityScore = await incrementAffinity(userId, characterId, CHOICE_DATE_AFFINITY);
    await setScene(userId, characterId, {
      mode: 'together',
      location,
      billPending: isPaidLocation(location),
    });
    return { ok: true, reaction: option.reaction, affinityScore, sceneChanged: true };
  }

  // --- bill: settle the tab, stay at the venue ---
  if (row.kind === 'bill') {
    const affinityScore = await incrementAffinity(userId, characterId, billAffinity(optionIndex));
    const scene = await getScene(userId, characterId);
    await setScene(userId, characterId, {
      mode: 'together',
      location: scene.location,
      billPending: false,
    });
    return { ok: true, reaction: option.reaction, affinityScore, sceneChanged: true };
  }

  // --- goal: advance progress, maybe post ---
  const { affinityDelta, goalDelta } = effectsForOption(option.advancesGoal);
  const affinityScore = await incrementAffinity(userId, characterId, affinityDelta);
  const goalProgress = await bumpGoalProgress(userId, characterId, goalDelta);
  let posted = false;
  if (option.advancesGoal && option.post) {
    await createPost(userId, characterId, option.post);
    posted = true;
  }
  return {
    ok: true,
    reaction: option.reaction,
    advancedGoal: option.advancesGoal,
    posted,
    affinityScore,
    goalProgress,
  };
}

/** Resolves a pending choice as a timeout (user let the hourglass run out). */
export async function timeoutChoice(userId: string, choiceId: string): Promise<SelectResult> {
  const row = await loadRow(userId, choiceId);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.status !== 'pending') {
    return { ok: true, timedOut: true, reaction: row.timeout_reaction };
  }
  await markTimedOut(row.id);
  const affinityScore = await incrementAffinity(userId, row.character_id, CHOICE_TIMEOUT_AFFINITY);
  return { ok: true, timedOut: true, reaction: row.timeout_reaction, affinityScore };
}
