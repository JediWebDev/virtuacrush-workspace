import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveArcAct,
  resolvePackNodeAct,
  buildInitialSceneState,
  formatPersistentSceneDirective,
} from './story_structure';
import type { StoryPack } from './pack_types';

test('resolveArcAct: early turns are beginning', () => {
  assert.equal(resolveArcAct({ userTurnsSinceStart: 1 }), 'beginning');
  assert.equal(resolveArcAct({ userTurnsSinceStart: 2, arcStatus: 'ongoing' }), 'beginning');
});

test('resolveArcAct: climax maps to end', () => {
  assert.equal(resolveArcAct({ userTurnsSinceStart: 5, arcStatus: 'climax' }), 'end');
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
