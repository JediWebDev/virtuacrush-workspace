import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jailEndFrom,
  jailSecondsLeft,
  formatArrestDirective,
  jailNarratorPrompt,
  fallbackBailResponse,
  JAIL_DURATION_MS,
  BAIL_THRESHOLD,
} from './jail_util';

test('jailEndFrom + jailSecondsLeft', () => {
  const now = 1_000_000;
  const end = jailEndFrom(now);
  assert.equal(new Date(end).getTime(), now + JAIL_DURATION_MS);
  assert.equal(jailSecondsLeft(end, now), JAIL_DURATION_MS / 1000);
  assert.equal(jailSecondsLeft(end, now + JAIL_DURATION_MS + 1), 0);
  assert.equal(jailSecondsLeft(null, now), 0);
});

test('formatArrestDirective mentions responders + character + ruin', () => {
  const d = formatArrestDirective('fire', 'A concert', 'a concert bouncer', 'Serena');
  assert.ok(d.includes('ARREST EVENT'));
  assert.ok(d.includes('Serena'));
  assert.ok(d.includes('a concert bouncer'));
  assert.ok(d.toLowerCase().includes('fire department'));
});

test('jailNarratorPrompt enforces realism limits', () => {
  const p = jailNarratorPrompt('Serena');
  assert.ok(p.toLowerCase().includes('narrator'));
  assert.ok(p.toLowerCase().includes('asterisks'));
  assert.ok(p.toLowerCase().includes('dynamite') || p.toLowerCase().includes('refuse'));
  assert.ok(p.includes('Serena'));
});

test('fallbackBailResponse: accept vs refuse', () => {
  assert.ok(fallbackBailResponse('Mina', true).toLowerCase().includes('bail'));
  assert.ok(fallbackBailResponse('Mina', false).toLowerCase().includes('no'));
  assert.ok(BAIL_THRESHOLD > 0 && BAIL_THRESHOLD < 100);
});
