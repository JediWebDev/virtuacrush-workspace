import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript } from './script_util';

test('parseScript: untagged legacy content -> single companion bubble', () => {
  const b = parseScript('hey, what are you up to?', 'Serena');
  assert.equal(b.length, 1);
  assert.equal(b[0].kind, 'companion');
  assert.equal(b[0].name, 'Serena');
  assert.equal(b[0].text, 'hey, what are you up to?');
});

test('parseScript: classifies companion, narrator, and npc tags in order', () => {
  const content = '[NARRATOR] *the door swings open*\n[SERENA] oh. hey.\n[SECURITY] you two, out. now.';
  const b = parseScript(content, 'Serena');
  assert.equal(b.length, 3);
  assert.deepEqual(b.map((x) => x.kind), ['narrator', 'companion', 'npc']);
  assert.equal(b[2].name, 'Security');
  assert.equal(b[1].text, 'oh. hey.');
});

test('parseScript: multi-word NPC tag is title-cased', () => {
  const b = parseScript('[MALL SECURITY] stop right there', 'Mina');
  assert.equal(b[0].kind, 'npc');
  assert.equal(b[0].name, 'Mall Security');
});

test('parseScript: drops a trailing incomplete tag while streaming', () => {
  const b = parseScript('[SERENA] one sec\n[SEC', 'Serena');
  assert.equal(b.length, 1);
  assert.equal(b[0].text, 'one sec');
});

test('parseScript: a companion line spanning multiple lines stays one bubble', () => {
  const b = parseScript('[SERENA] first line\nstill me talking', 'Serena');
  assert.equal(b.length, 1);
  assert.equal(b[0].kind, 'companion');
  assert.ok(b[0].text.includes('still me talking'));
});
