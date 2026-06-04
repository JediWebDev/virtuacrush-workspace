import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectArrivalIntent } from './arrival_util';

test('detectArrivalIntent: arrival / presence', () => {
  assert.equal(detectArrivalIntent("I'm waiting outside"), true);
  assert.equal(detectArrivalIntent("*I ring Serena's door bell*"), true);
  assert.equal(detectArrivalIntent('I knock on your door'), true);
  assert.equal(detectArrivalIntent("I'm at your place"), true);
  assert.equal(detectArrivalIntent('I show up at your place'), true);
  assert.equal(detectArrivalIntent('open the door'), true);
});

test('detectArrivalIntent: pickup + meet-there', () => {
  assert.equal(detectArrivalIntent("I'll pick you up"), true);
  assert.equal(detectArrivalIntent("I'm gonna pick u up"), true);
  assert.equal(detectArrivalIntent("I'll meet you there"), true);
  assert.equal(detectArrivalIntent('see you there'), true);
});

test('detectArrivalIntent: ordinary chat is not arrival', () => {
  assert.equal(detectArrivalIntent('how was your day?'), false);
  assert.equal(detectArrivalIntent('I love that song'), false);
  assert.equal(detectArrivalIntent("let's grab dinner sometime"), false);
  assert.equal(detectArrivalIntent(''), false);
});
