import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetHistory, type BudgetTurn } from './budget';

const turn = (role: 'user' | 'assistant', len: number, ch = 'x'): BudgetTurn => ({
  role,
  // No trailing whitespace: budgetHistory trims, which would shift lengths.
  content: `${ch} `.repeat(Math.ceil(len / 2)).slice(0, len).trimEnd().padEnd(len, ch),
});

test('budgetHistory: recent tail stays verbatim, older turns are snipped', () => {
  const turns = [turn('assistant', 800, 'a'), turn('user', 50, 'b'), turn('assistant', 600, 'c'), turn('user', 40, 'd')];
  const out = budgetHistory(turns, { keepFullTail: 2, maxCharsPerOldTurn: 100, maxTotalChars: 5000 });
  assert.equal(out.length, 4);
  assert.ok(out[0].content.length <= 101); // snipped (+ellipsis)
  assert.ok(out[0].content.endsWith('…'));
  assert.equal(out[2].content.length, 600); // verbatim tail
  assert.equal(out[3].content.length, 40);
});

test('budgetHistory: total cap drops oldest turns first, never the tail', () => {
  const turns = Array.from({ length: 10 }, (_, i) => turn(i % 2 ? 'assistant' : 'user', 300, String(i)));
  const out = budgetHistory(turns, { keepFullTail: 3, maxCharsPerOldTurn: 300, maxTotalChars: 1000 });
  assert.ok(out.length >= 3);
  // The last three original turns survive verbatim.
  assert.equal(out[out.length - 1].content, turns[9].content.trim());
  assert.ok(out.reduce((n, t) => n + t.content.length, 0) <= 1000 + 300); // tail can't be dropped
});

test('budgetHistory: short conversations pass through untouched', () => {
  const turns = [turn('user', 30), turn('assistant', 80)];
  const out = budgetHistory(turns);
  assert.deepEqual(out.map((t) => t.content.length), [30, 80]);
});

test('budgetHistory: empty input', () => {
  assert.deepEqual(budgetHistory([]), []);
});
