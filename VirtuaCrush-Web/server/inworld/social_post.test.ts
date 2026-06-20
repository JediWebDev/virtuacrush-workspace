import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectFirstContactExchange, postTriggerForTurn } from './social_post';

describe('social_post', () => {
  describe('detectFirstContactExchange', () => {
    it('fires on explicit number swap', () => {
      assert.ok(detectFirstContactExchange('Player: here, take my number\nSerena: saved.'));
      assert.ok(detectFirstContactExchange('we swapped numbers before I left'));
      assert.ok(detectFirstContactExchange('text me when you get home'));
      assert.ok(detectFirstContactExchange('555-867-5309'));
    });

    it('does not fire on casual follow-up plans', () => {
      assert.ok(!detectFirstContactExchange('see you again soon'));
      assert.ok(!detectFirstContactExchange('we should hang out next time'));
      assert.ok(!detectFirstContactExchange('come over whenever'));
      assert.ok(!detectFirstContactExchange('meet up at the cafe later'));
    });
  });

  describe('postTriggerForTurn', () => {
    it('prefers arc completion over contact keywords', () => {
      const t = postTriggerForTurn({
        completedArcId: 'serena_meet',
        arcBadgeTitle: 'Paint & Collision',
        turnText: 'here is my number',
        prevAffinity: 10,
        newAffinity: 15,
        emotionalDisclosure: false,
      });
      assert.equal(t?.key, 'arc:serena_meet');
    });

    it('returns contact_swap once-worthy trigger', () => {
      const t = postTriggerForTurn({
        turnText: 'Player: swap numbers?\nAssistant: sure, here is mine',
        prevAffinity: 20,
        newAffinity: 22,
        emotionalDisclosure: false,
      });
      assert.equal(t?.key, 'contact_swap');
    });

    it('affinity milestones get stable keys', () => {
      const t = postTriggerForTurn({
        turnText: 'nice weather',
        prevAffinity: 30,
        newAffinity: 36,
        emotionalDisclosure: false,
      });
      assert.equal(t?.key, 'affinity:35');
    });
  });
});
