import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWorldEvent, formatWorldEventDirective, respondersFor, incidentForEvent, MISCHIEF_FEE, CRIME_FEES } from './world_util';

test('detectWorldEvent: fire', () => {
  assert.deepEqual(detectWorldEvent('I set the curtains on fire'), { kind: 'crime', crimeType: 'fire' });
  assert.deepEqual(detectWorldEvent('I set fire to the stage'), { kind: 'crime', crimeType: 'fire' });
  assert.deepEqual(detectWorldEvent("let's burn this place down"), { kind: 'crime', crimeType: 'fire' });
  assert.equal(detectWorldEvent('I light a candle').kind === 'crime', false);
});

test('detectWorldEvent: theft', () => {
  assert.equal(detectWorldEvent('I shoplift a hoodie').crimeType, 'theft');
  assert.equal(detectWorldEvent('I steal the register').crimeType, 'theft');
  assert.equal(detectWorldEvent('I grab the cash and run').crimeType, 'theft');
  assert.equal(detectWorldEvent("let's dine and dash").crimeType, 'theft');
});

test('detectWorldEvent: destruction', () => {
  assert.equal(detectWorldEvent('I smash the window').crimeType, 'destruction');
  assert.equal(detectWorldEvent('I flip the table').crimeType, 'destruction');
  assert.equal(detectWorldEvent('I spray paint the wall').crimeType, 'destruction');
});

test('detectWorldEvent: violence', () => {
  assert.equal(detectWorldEvent('I punch the security guard').crimeType, 'violence');
  assert.equal(detectWorldEvent('I attack the bouncer').crimeType, 'violence');
  assert.equal(detectWorldEvent('I start a fight').crimeType, 'violence');
});

test('detectWorldEvent: mischief (warnable, not crime)', () => {
  assert.equal(detectWorldEvent('I start screaming at the top of my lungs').kind, 'mischief');
  assert.equal(detectWorldEvent("I make a scene").kind, 'mischief');
  assert.equal(detectWorldEvent('I climb on the table and dance').kind, 'mischief');
  assert.equal(detectWorldEvent('I cut in line').kind, 'mischief');
  assert.equal(detectWorldEvent('I dump detergent into the mall fountain').kind, 'mischief');
  assert.equal(detectWorldEvent('I pour soap into the fountain').kind, 'mischief');
});

test('detectWorldEvent: slang / benign phrasing is NOT an event (false-positive guards)', () => {
  assert.equal(detectWorldEvent('this place is fire 🔥').kind, 'none');
  assert.equal(detectWorldEvent('you totally steal the show').kind, 'none');
  assert.equal(detectWorldEvent("let's break the ice").kind, 'none');
  assert.equal(detectWorldEvent('that outfit is a total smash').kind, 'none');
  assert.equal(detectWorldEvent('I could kill for a coffee').kind, 'none');
  assert.equal(detectWorldEvent("I'm dying laughing").kind, 'none');
  assert.equal(detectWorldEvent('shoot your shot').kind, 'none');
  assert.equal(detectWorldEvent('how was your day?').kind, 'none');
});

test('respondersFor + directive content', () => {
  assert.ok(respondersFor('fire').includes('fire department'));
  const d = formatWorldEventDirective({ kind: 'crime', crimeType: 'fire' }, 'a concert bouncer', 'Serena');
  assert.ok(d.includes('WORLD EVENT'));
  assert.ok(d.includes('a concert bouncer'));
  assert.ok(d.includes('Serena'));
  assert.ok(d.toLowerCase().includes('fire department'));
  assert.equal(formatWorldEventDirective({ kind: 'none' }, 'x', 'y'), '');
  const m = formatWorldEventDirective({ kind: 'mischief' }, 'the café manager', 'Avery');
  assert.ok(m.includes('the café manager') && m.includes('warning'));
});

test('incidentForEvent: mischief -> flat cleanup fee, crime -> damages, none -> null', () => {
  const m = incidentForEvent({ kind: 'mischief' });
  assert.equal(m?.kind, 'mischief');
  assert.equal(m?.amount, MISCHIEF_FEE);

  const c = incidentForEvent({ kind: 'crime', crimeType: 'destruction' });
  assert.equal(c?.kind, 'crime');
  assert.equal(c?.amount, CRIME_FEES.destruction);
  assert.ok((c?.label ?? '').toLowerCase().includes('destruction'));

  assert.equal(incidentForEvent({ kind: 'none' }), null);
});

test('formatWorldEventDirective: off-date uses remote wording (no in-venue "thrown out")', () => {
  const off = formatWorldEventDirective({ kind: 'mischief' }, 'the authorities', 'Mina', false);
  assert.ok(off.includes('the authorities'));
  assert.ok(off.includes('Mina'));
  assert.ok(!off.includes('thrown out'));
  // engine-authoritative framing present
  assert.ok(off.toLowerCase().includes('decided by the simulation'));
});

