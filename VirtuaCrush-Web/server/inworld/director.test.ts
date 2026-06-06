import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectorPrompt, companionTagFor } from './director';

test('companionTagFor: uppercases a single-word name', () => {
  assert.equal(companionTagFor('Serena'), 'SERENA');
  assert.equal(companionTagFor(''), 'YOU');
});

test('buildDirectorPrompt: lists companion + narrator, and any npc, with rules', () => {
  const p = buildDirectorPrompt({
    companionSystem: 'You are Serena.',
    companionTag: 'SERENA',
    companionName: 'Serena',
    npcs: [{ tag: 'SECURITY', name: 'Security', kind: 'npc', brief: 'Steps in to warn them.' }],
    directives: '\n\n=== SETTING ===\nAt the mall.',
    history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '[SERENA] hey' }],
    userMessage: '*I dump soap in the fountain*',
  });
  assert.ok(p.includes('[SERENA]'));
  assert.ok(p.includes('[NARRATOR]'));
  assert.ok(p.includes('[SECURITY]'));
  assert.ok(p.includes('Steps in to warn them.'));
  assert.ok(p.includes('By DEFAULT only [SERENA] speaks'));
  assert.ok(p.includes('User: *I dump soap in the fountain*'));
});

test('buildDirectorPrompt: with no npcs, only companion + narrator are offered', () => {
  const p = buildDirectorPrompt({
    companionSystem: 'You are Mina.',
    companionTag: 'MINA',
    companionName: 'Mina',
    npcs: [],
    directives: '',
    history: [],
    userMessage: 'how was your day?',
  });
  assert.ok(p.includes('[MINA]'));
  assert.ok(p.includes('[NARRATOR]'));
  assert.ok(!p.includes('[SECURITY]'));
});
