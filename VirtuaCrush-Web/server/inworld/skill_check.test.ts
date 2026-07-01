import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSkillCheck,
  parseRollRequest,
  resolveRoll,
  clampD20,
  formatRollResolutionDirective,
  dmChallengeLine,
  DC_BY_DIFFICULTY,
} from './skill_check';
import { parseDirectorOutput, buildDirectorPrompt } from './director';

test('parseSkillCheck derives DC from difficulty and requires an action', () => {
  const c = parseSkillCheck({ required: true, action: 'leap the canal on a bike', difficulty: 'hard' });
  assert.ok(c);
  assert.equal(c!.dc, DC_BY_DIFFICULTY.hard);
  assert.equal(c!.difficulty, 'hard');
});

test('parseSkillCheck rejects missing/invalid fields and required:false', () => {
  assert.equal(parseSkillCheck({ required: false, action: 'x', difficulty: 'hard' }), null);
  assert.equal(parseSkillCheck({ action: '', difficulty: 'hard' }), null);
  assert.equal(parseSkillCheck({ action: 'x', difficulty: 'legendary' }), null);
  assert.equal(parseSkillCheck(null), null);
  assert.equal(parseSkillCheck('nope'), null);
});

test('resolveRoll: meet-or-beat, with nat-20 / nat-1 overrides', () => {
  assert.equal(resolveRoll('a', 16, 16).success, true);
  assert.equal(resolveRoll('a', 15, 16).success, false);
  // nat 20 always succeeds even vs formidable
  assert.equal(resolveRoll('a', 20, 19).crit, true);
  assert.equal(resolveRoll('a', 20, 99).success, true);
  // nat 1 always fails even vs trivial
  const fumble = resolveRoll('a', 1, 5);
  assert.equal(fumble.fumble, true);
  assert.equal(fumble.success, false);
});

test('clampD20 keeps values in 1..20 and defaults NaN to 1', () => {
  assert.equal(clampD20(0), 1);
  assert.equal(clampD20(21), 20);
  assert.equal(clampD20(13), 13);
  assert.equal(clampD20('nope'), 1);
});

test('parseRollRequest validates payload and resolves engine-side', () => {
  const ok = parseRollRequest({ action: 'duel the barista', value: 18, dc: 12 });
  assert.ok(ok);
  assert.equal(ok!.success, true);
  assert.equal(parseRollRequest({ action: '', value: 10, dc: 12 }), null);
  assert.equal(parseRollRequest({ action: 'x', value: 'a', dc: 12 }), null);
  assert.equal(parseRollRequest(undefined), null);
});

test('dmChallengeLine uses model flavor but guarantees the target number', () => {
  const base = parseSkillCheck({ action: 'fly like a superhero', difficulty: 'hard', prompt: 'So you can fly now? Bold.' })!;
  // Flavor lacked the number, so the mechanic clause is appended with the real DC (16).
  assert.match(dmChallengeLine(base), /So you can fly now\?/);
  assert.match(dmChallengeLine(base), /\b16\b/);
  // Flavor that already states the number is used verbatim.
  const withNum = { ...base, prompt: 'Give me a d20 — beat a 16 or gravity wins.' };
  assert.equal(dmChallengeLine(withNum), 'Give me a d20 — beat a 16 or gravity wins.');
  // No flavor -> deterministic fallback that names the DC.
  const noFlavor = { ...base, prompt: '' };
  assert.match(dmChallengeLine(noFlavor), /Roll a d20 — you need a 16 or higher\./);
});

test('resolution directive names the verdict and forbids another roll', () => {
  const dir = formatRollResolutionDirective(resolveRoll('duel the barista', 4, 16));
  assert.match(dir, /FAILURE/);
  assert.match(dir, /do NOT request another roll/i);
});

test('director prompt exposes skillCheck normally but not on resolution turns', () => {
  const base = {
    companionSystem: 'You are Mina.',
    companionTag: 'MINA',
    companionName: 'Mina',
    npcs: [],
    directives: '',
    history: [],
    userMessage: 'I flip the table and challenge everyone to a duel',
  };
  const normal = buildDirectorPrompt(base);
  // The output schema advertises the skillCheck field on a normal turn.
  assert.match(normal, /"skillCheck": \{ "required"/);
  assert.match(normal, /DUNGEON MASTER/);

  const resolution = buildDirectorPrompt({
    ...base,
    rollResolutionDirective: formatRollResolutionDirective(resolveRoll('challenge everyone to a duel', 3, 16)),
  });
  // On a resolution turn the schema must NOT advertise the field and the DM
  // rules block is gone. (The directive prose legitimately says the word
  // "skillCheck" when telling the model not to emit one — so match the field.)
  assert.doesNotMatch(resolution, /"skillCheck": \{ "required"/);
  assert.doesNotMatch(resolution, /DUNGEON MASTER/);
  assert.match(resolution, /DICE RESOLUTION/);
});

test('parseDirectorOutput extracts a skillCheck from director JSON', () => {
  const raw = JSON.stringify({
    intent: { type: 'conflict', subtype: 'challenge' },
    lines: [{ speaker: 'Mina', text: 'Whoa — you sure about this?' }],
    skillCheck: { required: true, action: 'challenge everyone to a duel', difficulty: 'formidable', reason: 'wildly absurd' },
  });
  const out = parseDirectorOutput(raw, 'Mina');
  assert.ok(out.skillCheck);
  assert.equal(out.skillCheck!.difficulty, 'formidable');
  assert.equal(out.skillCheck!.dc, DC_BY_DIFFICULTY.formidable);
});

test('parseDirectorOutput leaves skillCheck null when absent', () => {
  const raw = JSON.stringify({
    intent: { type: 'social', subtype: 'chat' },
    lines: [{ speaker: 'Mina', text: 'Hey you.' }],
  });
  assert.equal(parseDirectorOutput(raw, 'Mina').skillCheck, null);
});
