import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeScene, renderSceneHeader, renderSceneFactsBlock, type ComposeParams } from './scene_composer';
import { friendFor, hashSeed } from './scene_registry';

const BASE: ComposeParams = {
  characterId: 'becca',
  displayName: 'Becca',
  phase: 'home',
  scene: { mode: 'apart', location: null, billPending: false, plannedLocation: null },
  state: { activity: 'half-watching a cooking show', mood: 'easy', headline: '', goalProgress: 10 },
  now: new Date('2026-06-09T21:15:00'),
  forDate: '2026-06-09',
  seed: 1234,
};

test('composeScene: deterministic for the same seed, varies across seeds', () => {
  const a = composeScene(BASE);
  const b = composeScene(BASE);
  assert.deepEqual(a, b);
  const c = composeScene({ ...BASE, seed: 9999 });
  assert.notDeepEqual({ ...a, composedAt: '' }, { ...c, composedAt: '' });
});

test('composeScene: home scene has setting, details, and an outfit', () => {
  const c = composeScene(BASE);
  assert.equal(c.phase, 'home');
  assert.ok(c.setting.includes('her place'));
  assert.ok(c.details.length >= 1);
  assert.ok(c.outfit.length > 5);
  assert.equal(c.activity, 'half-watching a cooking show');
});

test('composeScene: on_date anchors at the venue', () => {
  const c = composeScene({
    ...BASE,
    phase: 'on_date',
    scene: { mode: 'together', location: 'coffee_shop', billPending: false },
  });
  assert.equal(c.locationSlug, 'coffee_shop');
  assert.ok(c.setting.includes('coffee shop'));
  assert.equal(c.cast.length, 0); // no friend rolls on dates (MVP)
});

test('composeScene: planning mentions the planned venue', () => {
  const c = composeScene({
    ...BASE,
    phase: 'planning',
    scene: { mode: 'apart', location: null, billPending: false, plannedLocation: 'arcade' },
  });
  assert.equal(c.locationSlug, 'arcade');
  assert.ok(c.setting.includes('getting ready'));
});

test('friendFor: stable canonical identity per character', () => {
  const a = friendFor('becca');
  const b = friendFor('becca');
  assert.deepEqual(a, b);
  assert.ok(a.name.length > 1);
});

test('cast friend appears for some seeds and carries an agenda', () => {
  let found = false;
  for (let s = 0; s < 40 && !found; s++) {
    const c = composeScene({ ...BASE, seed: hashSeed(`probe:${s}`) });
    if (c.cast.length) {
      found = true;
      assert.equal(c.cast[0].name, friendFor('becca').name); // canonical, never random
      assert.ok(c.cast[0].agenda.length > 5);
    }
  }
  assert.ok(found, 'expected the friend to appear within 40 seeds');
});

test('renderSceneHeader: readable narration with time + outfit', () => {
  const c = composeScene(BASE);
  const h = renderSceneHeader(c, 'Becca');
  assert.ok(h.includes('Tuesday'));
  assert.ok(h.includes("She's in"));
  assert.ok(!h.includes('undefined'));
});

test('activity sanitizer: away/engine-leak activities are replaced at home', () => {
  const c = composeScene({
    ...BASE,
    state: { ...BASE.state, activity: 'Stealing a lipstick from a high-end store.' },
  });
  assert.ok(!/user/i.test(c.activity));
  assert.ok(!/steal/i.test(c.activity));
  assert.ok(!/\.$/.test(c.activity)); // no trailing period (avoids "..")
  // Compatible activities survive, lowercased and unpunctuated.
  const ok = composeScene({ ...BASE, state: { ...BASE.state, activity: 'Sketching in her notebook.' } });
  assert.equal(ok.activity, 'sketching in her notebook');
});

test('first meeting: meet-cute hook, no friend, stranger facts', () => {
  const c = composeScene({ ...BASE, firstMeeting: true });
  assert.equal(c.firstMeeting, true);
  assert.ok(c.meetHook && c.meetHook.length > 10);
  assert.equal(c.cast.length, 0); // first meetings stay one-on-one
  const header = renderSceneHeader(c, 'Becca');
  assert.ok(header.includes("Where things go from here is up to you"));
  const facts = renderSceneFactsBlock(c, 'Becca');
  assert.ok(facts.includes('FIRST MEETING'));
  assert.ok(facts.includes('do not invent any'));
});

test('returning visit: no meet-cute, normal narration', () => {
  const c = composeScene({ ...BASE, firstMeeting: false });
  assert.equal(c.firstMeeting, false);
  assert.equal(c.meetHook, undefined);
  const header = renderSceneHeader(c, 'Becca');
  assert.ok(!header.includes('never spoken'));
  const facts = renderSceneFactsBlock(c, 'Becca');
  assert.ok(!facts.includes('FIRST MEETING'));
});

test('renderSceneFactsBlock: authoritative facts incl. outfit lock + cast rules', () => {
  const c = composeScene(BASE);
  const f = renderSceneFactsBlock(c, 'Becca');
  assert.ok(f.includes('SCENE FACTS'));
  assert.ok(f.includes('do not change or re-invent her outfit'));
  if (c.cast.length) {
    assert.ok(f.includes(c.cast[0].name.toUpperCase()));
  } else {
    assert.ok(f.includes('Do not invent other people'));
  }
});
