import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDevResetEnabled } from './dev_reset';

test('isDevResetEnabled: off in production by default', () => {
  const prev = { ...process.env };
  process.env.NODE_ENV = 'production';
  delete process.env.ALLOW_DEV_RESET;
  delete process.env.DISABLE_DEV_RESET;
  assert.equal(isDevResetEnabled(), false);
  process.env.ALLOW_DEV_RESET = '1';
  assert.equal(isDevResetEnabled(), true);
  Object.assign(process.env, prev);
});

test('isDevResetEnabled: on in non-production', () => {
  const prev = { ...process.env };
  process.env.NODE_ENV = 'development';
  delete process.env.DISABLE_DEV_RESET;
  assert.equal(isDevResetEnabled(), true);
  process.env.DISABLE_DEV_RESET = '1';
  assert.equal(isDevResetEnabled(), false);
  Object.assign(process.env, prev);
});
