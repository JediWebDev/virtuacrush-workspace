import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arcOpeningLine, composeArcOpeningProse } from './active_arc';
import type { StoryArc } from './arcs';

describe('composeArcOpeningProse', () => {
  it('never leaks PLAYER directive text', () => {
    const prose = composeArcOpeningProse({
      setting: 'a BDSM dungeon with dim lighting',
      situation: 'Serena wants to explore this with you in a safe space.',
      coPresent: true,
      playerSituation: 'You can communicate your boundaries clearly.',
    });
    assert.ok(prose);
    assert.match(prose!, /You find yourself/i);
    assert.doesNotMatch(prose!, /PLAYER'S CURRENT/i);
    assert.doesNotMatch(prose!, /authoritative/i);
    assert.match(prose!, /boundaries clearly/i);
  });

  it('prefers authored introNarrative', () => {
    const arc = {
      introNarrative: 'The door clicks shut behind you.',
      sceneAnchor: { setting: 'a warehouse', situation: 'ignored', coPresent: true },
    } as StoryArc;
    assert.equal(arcOpeningLine(arc), 'The door clicks shut behind you.');
  });
});
