import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectorPrompt, companionTagFor, parseDirectorTurns, parseScene, turnsToTranscript } from './director';

test('companionTagFor uppercases a name', () => {
  assert.equal(companionTagFor('Serena'), 'SERENA');
  assert.equal(companionTagFor(''), 'YOU');
});

test('buildDirectorPrompt asks for JSON and lists speakers, no tag rules', () => {
  const p = buildDirectorPrompt({
    companionSystem: 'You are Serena.',
    companionTag: 'SERENA',
    companionName: 'Serena',
    npcs: [{ tag: 'SECURITY', name: 'Security', kind: 'npc', brief: 'Steps in to warn them.' }],
    directives: '\n\nAt the mall.',
    history: [{ role: 'user', content: 'hi' }],
    userMessage: '*dumps soap in the fountain*',
  });
  assert.ok(p.includes('JSON object'));
  assert.ok(p.includes('"Serena"'));
  assert.ok(p.includes('"narrator"'));
  assert.ok(p.includes('"Security"'));
  assert.ok(p.includes('Output ONLY the JSON object'));
  assert.ok(p.includes('ALWAYS include at least one'));
  assert.ok(p.includes('User: *dumps soap in the fountain*'));
});

test('parseDirectorTurns: clean JSON array', () => {
  const turns = parseDirectorTurns('[{"speaker":"Serena","text":"oh no"},{"speaker":"narrator","text":"*she winces*"}]', 'Serena');
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0], { speaker: 'Serena', text: 'oh no' });
  assert.equal(turns[1].speaker, 'narrator');
});

test('parseDirectorTurns: tolerates code fences and surrounding prose', () => {
  const turns = parseDirectorTurns('Sure!\n```json\n[{"speaker":"Serena","text":"hey"}]\n```', 'Serena');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, 'hey');
});

test('parseDirectorTurns: prose (no JSON) becomes a single companion line (never blank)', () => {
  const turns = parseDirectorTurns('hey, what are you up to tonight?', 'Serena');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].speaker, 'Serena');
  assert.equal(turns[0].text, 'hey, what are you up to tonight?');
});

test('parseDirectorTurns: salvages "text" values from malformed JSON', () => {
  const turns = parseDirectorTurns('{"speaker":"Serena","text":"salvaged line"', 'Serena'); // missing closing brace/bracket
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, 'salvaged line');
});

test('parseDirectorTurns: empty input -> empty (route supplies a fallback line)', () => {
  assert.deepEqual(parseDirectorTurns('', 'Serena'), []);
});

test('turnsToTranscript: renders canonical tagged transcript', () => {
  const t = turnsToTranscript([
    { speaker: 'Serena', text: 'hi' },
    { speaker: 'narrator', text: '*the door opens*' },
    { speaker: 'Security', text: 'out, now' },
  ]);
  assert.equal(t, '[SERENA] hi\n[NARRATOR] *the door opens*\n[SECURITY] out, now');
});

test('parseScene: malformed scene JSON never leaks structure, still salvages intent', () => {
  const raw = '{"intent": { "type": "observation", "subtype": "introduction", "target": "Andrew lines":';
  const { intent, turns } = parseScene(raw, 'Madison');
  for (const t of turns) {
    assert.ok(!/"(?:intent|lines|speaker|text|type)"\s*:/.test(t.text), `leaked JSON: ${t.text}`);
  }
  assert.equal(intent?.type, 'observation');
});

test('parseScene: repairs truncated JSON and extracts the line', () => {
  const raw = '{"intent":{"type":"social","subtype":"greeting"},"lines":[{"speaker":"Madison","text":"hi there!"}';
  const { intent, turns } = parseScene(raw, 'Madison');
  assert.equal(intent?.type, 'social');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, 'hi there!');
});

test('parseDirectorTurns: strips leaked JSON speaker keys from line text', () => {
  const turns = parseDirectorTurns('[{"speaker":"Ash","text":"Ash\\": \\"hey there\\""}]', 'Ash');
  assert.equal(turns.length, 1);
  assert.equal(turns[0].text, 'hey there');
  const salvaged = parseDirectorTurns('ash":"looks up from the photo"', 'Ash');
  assert.equal(salvaged[0]?.text, 'looks up from the photo');
});

test('parseDirectorTurns: strips leaked character_actions and character_lines keys', () => {
  const actions = parseDirectorTurns('[{"speaker":"Serena","text":"serena_actions\\": [\\"*smirks*\\"]"}]', 'Serena');
  assert.equal(actions[0]?.text, '*smirks*');
  const lines = parseDirectorTurns('serena_lines": "hey, you made it"', 'Serena');
  assert.equal(lines[0]?.text, 'hey, you made it');
  const trailing = parseDirectorTurns('[{"speaker":"Serena","text":"*waves*"]"}]', 'Serena');
  assert.equal(trailing[0]?.text, '*waves*');
});
