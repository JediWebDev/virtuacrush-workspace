import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSceneNpc,
  resolveSceneNpcs,
  formatSceneNpcBlock,
  suggestBystanderForSetting,
  disruptiveNpcs,
  parseSceneNpcRefs,
  legacyPackNpcToRef,
  sceneCastToNpcRefs,
} from './npc_schema';

describe('npc_schema', () => {
  it('resolveSceneNpc merges archetype brief with custom description', () => {
    const n = resolveSceneNpc({
      name: 'Urik',
      stance: 'enemy',
      archetypeId: 'rival',
      description: 'Pushy ex who keeps interrupting.',
    });
    assert.equal(n.stance, 'enemy');
    assert.match(n.promptBrief, /Pushy ex/);
    assert.equal(n.canDisrupt, true);
    assert.equal(n.speakerTag, 'URIK');
  });

  it('formatSceneNpcBlock includes stance and speaker tags', () => {
    const block = formatSceneNpcBlock(
      resolveSceneNpcs([{ name: 'Maya', stance: 'friend', archetypeId: 'wingman' }]),
    );
    assert.match(block, /SCENE NPCs/);
    assert.match(block, /FRIEND/);
    assert.match(block, /\[MAYA\]/);
  });

  it('suggestBystanderForSetting matches cafe settings', () => {
    const n = suggestBystanderForSetting('a cozy corner cafe downtown', () => 0);
    assert.ok(n);
    assert.equal(n!.roleId, 'barista');
  });

  it('disruptiveNpcs sorts by chaos weight', () => {
    const npcs = resolveSceneNpcs([
      { name: 'A', stance: 'bystander', archetypeId: 'barista_default' },
      { name: 'B', stance: 'enemy', archetypeId: 'rival' },
    ]);
    const d = disruptiveNpcs(npcs);
    assert.ok(d.length >= 1);
    assert.equal(d[0]!.name, 'B');
  });

  it('parseSceneNpcRefs validates stance and caps count', () => {
    const refs = parseSceneNpcRefs([
      { name: 'Sam', stance: 'friend' },
      { name: '', stance: 'enemy' },
      { name: 'Guard', stance: 'bystander', roleId: 'security_guard' },
    ]);
    assert.equal(refs.length, 2);
    assert.equal(refs[1]!.roleId, 'security_guard');
  });

  it('legacyPackNpcToRef infers enemy from description', () => {
    const ref = legacyPackNpcToRef({
      name: 'Urik',
      description: 'Jealous rival who tries to bait the player.',
    });
    assert.equal(ref.stance, 'enemy');
    assert.equal(ref.archetypeId, 'rival');
  });

  it('sceneCastToNpcRefs maps composer cast to friends', () => {
    const refs = sceneCastToNpcRefs([
      { name: 'Rachel', role: 'roommate', vibe: 'loud', agenda: 'venting about work' },
    ]);
    assert.equal(refs[0]!.stance, 'friend');
    assert.equal(refs[0]!.archetypeId, 'companion_best_friend');
  });
});
