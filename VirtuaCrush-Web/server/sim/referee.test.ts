import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRefereePrompt, extractIntent, type RefereeInput } from './referee';

const input: RefereeInput = {
  message: '*I tie up Becca and empty the register*',
  scene: { phase: 'home', where: "Becca's video store", companion: { id: 'becca', name: 'Becca' }, present: [{ id: 'becca', name: 'Becca' }] },
  roster: [{ id: 'becca', name: 'Becca' }, { id: 'serena', name: 'Serena' }],
  history: [{ role: 'user', content: 'hey' }, { role: 'assistant', content: '[BECCA] hey you' }],
};

test('buildRefereePrompt lists all categories + schema keys + scene + message', () => {
  const p = buildRefereePrompt(input);
  for (const c of ['social', 'romance', 'transaction', 'movement', 'conflict', 'work', 'observation']) {
    assert.ok(p.includes(`- ${c}:`), `missing category ${c}`);
  }
  assert.ok(p.includes('"interpretation"'));
  assert.ok(p.includes('"intent"'));
  assert.ok(p.includes('"affectedNpcs"'));
  assert.ok(p.includes('"npcIntentHints"'));
  assert.ok(p.includes('"sceneHints"'));
  assert.ok(p.includes('SCENE HINTS'));
  assert.ok(p.includes('CLASSIFY'));
  assert.ok(p.toLowerCase().includes('do not decide consequences'));
  assert.ok(p.includes('Classify hostility accurately'));
  assert.ok(!p.includes('prefer "social" or "romance"'));
  assert.ok(p.includes('becca (Becca)')); // roster id (name)
  assert.ok(p.includes('PLAYER: *I tie up Becca and empty the register*'));
});

test('extractIntent: parses an injected JSON completion into a typed intent', async () => {
  // 'crime' was folded into 'conflict' (+ the separate detectWorldEvent path);
  // the referee now classifies aggression as conflict.
  const fakeComplete = async () =>
    '{"interpretation":"threatens Becca behind the register","intent":{"type":"conflict","subtype":"menace"},"affectedNpcs":["becca"],"npcIntentHints":[{"npc":"becca","wants":"call police"}]}';
  const out = await extractIntent(input, fakeComplete);
  assert.equal(out.intent.type, 'conflict');
  assert.equal(out.intent.subtype, 'threaten'); // 'menace' normalized by SYNONYMS
  assert.deepEqual(out.affectedNpcs, ['becca']);
  assert.equal(out.npcIntentHints[0].wants, 'call police');
});

test('extractIntent: parses sceneHints from referee JSON', async () => {
  const fakeComplete = async () =>
    JSON.stringify({
      interpretation: 'declares they are captive in the basement',
      intent: { type: 'observation', subtype: 'share' },
      affectedNpcs: [],
      npcIntentHints: [],
      sceneHints: {
        locationPhrase: 'the basement',
        coPresent: false,
        playerMobility: 'restrained',
        playerNotes: 'tied to a pipe',
      },
    });
  const out = await extractIntent(input, fakeComplete);
  assert.equal(out.sceneHints?.locationPhrase, 'the basement');
  assert.equal(out.sceneHints?.coPresent, false);
  assert.equal(out.sceneHints?.playerMobility, 'restrained');
  assert.equal(out.sceneHints?.playerNotes, 'tied to a pipe');
});

test('extractIntent: a thrown completion fails soft to observation', async () => {
  const boom = async () => { throw new Error('model down'); };
  const out = await extractIntent(input, boom);
  assert.deepEqual(out.intent, { type: 'observation', subtype: 'wait' });
});

test('extractIntent: garbage completion fails soft to observation', async () => {
  const out = await extractIntent(input, async () => 'sorry I cannot help with that');
  assert.equal(out.intent.type, 'observation');
});
