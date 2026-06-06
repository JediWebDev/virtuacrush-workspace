import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorityShortName, authorityActor } from './npcs';

test('authorityShortName: maps venue authorities to short labels', () => {
  assert.equal(authorityShortName('a mall security guard'), 'Security');
  assert.equal(authorityShortName('the café manager'), 'Manager');
  assert.equal(authorityShortName('a concert bouncer'), 'Bouncer');
  assert.equal(authorityShortName('a theater usher'), 'Usher');
  assert.equal(authorityShortName('the course marshal'), 'Marshal');
  assert.equal(authorityShortName('a concerned neighbor'), 'Neighbor');
  assert.equal(authorityShortName('the authorities'), 'Staff');
});

test('authorityActor: builds an npc actor with uppercase tag + brief', () => {
  const a = authorityActor('a mall security guard', 'Steps in to warn them.');
  assert.equal(a.kind, 'npc');
  assert.equal(a.name, 'Security');
  assert.equal(a.tag, 'SECURITY');
  assert.equal(a.brief, 'Steps in to warn them.');
});
