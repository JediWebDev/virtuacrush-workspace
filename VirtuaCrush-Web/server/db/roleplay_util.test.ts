import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLEPLAY_INPUT_DIRECTIVE,
  characterDisciplineDirective,
  formatRoleplayDirectives,
} from './roleplay_util';

test('input directive teaches the *action* vs speech distinction and consequences', () => {
  assert.match(ROLEPLAY_INPUT_DIRECTIVE, /\*asterisks\*/);
  assert.match(ROLEPLAY_INPUT_DIRECTIVE, /ACTION/);
  assert.match(ROLEPLAY_INPUT_DIRECTIVE, /speaking aloud/i);
  assert.match(ROLEPLAY_INPUT_DIRECTIVE, /consequence/i);
});

test('discipline directive injects the character name and bans self-narration', () => {
  const d = characterDisciplineDirective('Serena');
  assert.match(d, /Serena/);
  assert.match(d, /FIRST/);
  assert.match(d, /third person/i);
  // anti-hallucination clause
  assert.match(d, /do NOT invent/);
});

test('formatRoleplayDirectives concatenates input + discipline in order', () => {
  const combined = formatRoleplayDirectives('Mina');
  assert.ok(combined.startsWith(ROLEPLAY_INPUT_DIRECTIVE));
  assert.ok(combined.includes('Mina'));
  assert.ok(combined.length > ROLEPLAY_INPUT_DIRECTIVE.length);
});
