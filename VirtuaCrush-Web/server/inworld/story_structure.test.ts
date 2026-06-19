import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveArcAct,
  resolvePackNodeAct,
  buildInitialSceneState,
  formatPersistentSceneDirective,
  validateSceneStateUpdate,
  nameInSceneState,
  resolveArcNpcInstruction,
} from './story_structure';
import type { StoryPack } from './pack_types';

test('resolveArcAct: early turns are beginning', () => {
  assert.equal(resolveArcAct({ userTurnsSinceStart: 1 }), 'beginning');
  assert.equal(resolveArcAct({ userTurnsSinceStart: 2, arcStatus: 'ongoing' }), 'beginning');
});

test('resolveArcAct: meet arcs enter end act sooner', () => {
  assert.equal(resolveArcAct({ userTurnsSinceStart: 1, isMeetArc: true }), 'beginning');
  assert.equal(resolveArcAct({ userTurnsSinceStart: 3, isMeetArc: true }), 'middle');
  assert.equal(resolveArcAct({ userTurnsSinceStart: 6, isMeetArc: true }), 'end');
});

test('resolvePackNodeAct: start is beginning, terminal is end', () => {
  const pack: StoryPack = {
    id: 't',
    characterId: 'lexi',
    title: 'T',
    blurb: '',
    tags: [],
    mood: 'dramatic',
    estimatedMinutes: 5,
    coverGradient: ['#000', '#111'],
    systemInstruction: '',
    nodes: {
      start: { npcInstruction: 'open', choices: [{ id: 'c', label: 'go', next: 'mid', userMessage: 'go' }] },
      mid: { npcInstruction: 'middle', choices: [{ id: 'c2', label: 'end', next: 'fin', userMessage: 'end' }] },
      fin: { npcInstruction: 'done', choices: null },
    },
  };
  assert.equal(resolvePackNodeAct(pack, 'start'), 'beginning');
  assert.equal(resolvePackNodeAct(pack, 'fin'), 'end');
});

test('resolvePackNodeAct: respects explicit act tag', () => {
  const pack: StoryPack = {
    id: 't',
    characterId: 'lexi',
    title: 'T',
    blurb: '',
    tags: [],
    mood: 'dramatic',
    estimatedMinutes: 5,
    coverGradient: ['#000', '#111'],
    systemInstruction: '',
    nodes: {
      start: { npcInstruction: 'open', act: 'middle', choices: null },
    },
  };
  assert.equal(resolvePackNodeAct(pack, 'start'), 'middle');
});

test('formatPersistentSceneDirective includes cast and change rules', () => {
  const block = formatPersistentSceneDirective({
    setting: 'a garage',
    situation: 'Caught in the act.',
    coPresent: true,
    presentCharacters: [
      { name: 'you', role: 'player' },
      { name: 'Lexi', role: 'companion' },
    ],
  });
  assert.match(block, /SCENE DIRECTIVE/);
  assert.match(block, /Lexi/);
  assert.match(block, /SCENE CHANGES/);
});

test('buildInitialSceneState seeds location and cast', () => {
  const s = buildInitialSceneState({
    setting: 'bookstore',
    situation: 'Rain on the windows.',
    coPresent: true,
    presentCharacters: [{ name: 'Mina', role: 'companion' }],
  });
  assert.match(s, /bookstore/);
  assert.match(s, /Mina/);
});

test('validateSceneStateUpdate flags dropped cast', () => {
  const prior = 'Location: garage. Present: you (player); Lexi (companion).';
  const bad = 'Location: garage. Present: you (player).';
  const v = validateSceneStateUpdate({
    priorSceneState: prior,
    nextSceneState: bad,
    requiredNames: ['you', 'Lexi'],
  });
  assert.equal(v.ok, false);
  assert.deepEqual(v.droppedCharacters, ['Lexi']);
});

test('validateSceneStateUpdate allows explicit departure', () => {
  const v = validateSceneStateUpdate({
    priorSceneState: 'Location: garage. Present: you; Lexi; Urik.',
    nextSceneState: 'Location: garage. Present: you; Lexi. Urik left the scene.',
    requiredNames: ['you', 'Lexi', 'Urik'],
    narratorTexts: ['*Urik turns and walks away.*'],
  });
  assert.equal(v.ok, true);
});

test('nameInSceneState matches player aliases', () => {
  assert.equal(nameInSceneState('Present: you (player)', 'you'), true);
});

test('resolveArcNpcInstruction appends act-specific block', () => {
  const out = resolveArcNpcInstruction('Base behavior.', { middle: 'Escalate the tension.' }, 'middle');
  assert.match(out, /Base behavior/);
  assert.match(out, /Escalate the tension/);
  assert.match(out, /MIDDLE/);
});

test('resolveArcNpcInstruction returns base when no phase override', () => {
  assert.equal(resolveArcNpcInstruction('Only base.', undefined, 'beginning'), 'Only base.');
});
