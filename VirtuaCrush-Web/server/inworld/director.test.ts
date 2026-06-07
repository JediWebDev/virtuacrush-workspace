import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectorPrompt, companionTagFor, parseDirectorTurns, turnsToTranscript } from './director';

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
  assert.ok(p.includes('JSON array'));
  assert.ok(p.includes('"Serena"'));
  assert.ok(p.includes('"narrator"'));
  assert.ok(p.includes('"Security"'));
  assert.ok(p.includes('Output ONLY the JSON array'));
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
