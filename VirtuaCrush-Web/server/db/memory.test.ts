// Unit tests for the pure RAG-memory helpers (no DB or embedder needed).
// Run with: npm run test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cosineSimilarity,
  rankMemories,
  parseFacts,
  formatMemoryBlock,
  type UserMemory,
} from './memory_util';

test('cosineSimilarity: identical vectors = 1', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
});

test('cosineSimilarity: orthogonal = 0, opposite = -1', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [-1, 0]) - -1) < 1e-9);
});

test('cosineSimilarity: bad input returns 0', () => {
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0); // length mismatch
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0); // zero vector
});

test('rankMemories: orders by similarity and applies the floor', () => {
  const candidates: UserMemory[] = [
    { fact: 'exact', embedding: [1, 0] },
    { fact: 'close', embedding: [0.9, 0.1] },
    { fact: 'orthogonal', embedding: [0, 1] }, // sim 0 -> below floor, dropped
  ];
  const ranked = rankMemories([1, 0], candidates, 8, 0.25);
  assert.deepEqual(ranked, ['exact', 'close']);
});

test('rankMemories: respects k', () => {
  const candidates: UserMemory[] = [
    { fact: 'a', embedding: [1, 0] },
    { fact: 'b', embedding: [0.95, 0.05] },
    { fact: 'c', embedding: [0.9, 0.1] },
  ];
  assert.equal(rankMemories([1, 0], candidates, 2, 0).length, 2);
});

test('parseFacts: plain JSON array', () => {
  assert.deepEqual(parseFacts('["User\'s name is Andrew.", "User has a dog."]'), [
    "User's name is Andrew.",
    'User has a dog.',
  ]);
});

test('parseFacts: tolerates markdown fences and surrounding prose', () => {
  const raw = 'Sure! Here you go:\n```json\n["User lives in Toronto."]\n```\nHope that helps.';
  assert.deepEqual(parseFacts(raw), ['User lives in Toronto.']);
});

test('parseFacts: empty array and junk return []', () => {
  assert.deepEqual(parseFacts('[]'), []);
  assert.deepEqual(parseFacts('no json here'), []);
  assert.deepEqual(parseFacts('{"not":"an array"}'), []);
});

test('parseFacts: dedupes case-insensitively and drops non-strings/too-short', () => {
  const raw = '["User likes jazz.", "user likes jazz.", 42, "User plays guitar.", "x"]';
  // "x" is too short (<3), 42 is a non-string, and the case-variant duplicate is removed.
  assert.deepEqual(parseFacts(raw), ['User likes jazz.', 'User plays guitar.']);
});

test('parseFacts: accepts object with text/content field', () => {
  assert.deepEqual(parseFacts({ content: '["User is a teacher."]' }), ['User is a teacher.']);
});

test('formatMemoryBlock: empty facts -> empty string', () => {
  assert.equal(formatMemoryBlock([]), '');
});

test('formatMemoryBlock: renders a bulleted block', () => {
  const block = formatMemoryBlock(["User's name is Andrew."]);
  assert.ok(block.includes("- User's name is Andrew."));
  assert.ok(block.toUpperCase().includes('REMEMBER'));
});
