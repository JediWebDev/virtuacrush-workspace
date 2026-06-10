import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProviderName } from './index';
import { openAiConfig, buildChatBody, parseChatResponse } from './openai';

test('selectProviderName: defaults to inworld when unset', () => {
  assert.equal(selectProviderName({}), 'inworld');
});

test('selectProviderName: openai aliases all map to openai', () => {
  for (const v of ['openai', 'openai-compatible', 'openrouter', 'OpenAI', 'OPENROUTER']) {
    assert.equal(selectProviderName({ LLM_PROVIDER: v }), 'openai', `for ${v}`);
  }
});

test('selectProviderName: explicit inworld and unknown values stay inworld', () => {
  assert.equal(selectProviderName({ LLM_PROVIDER: 'inworld' }), 'inworld');
  assert.equal(selectProviderName({ LLM_PROVIDER: 'banana' }), 'inworld');
});

test('openAiConfig: sensible defaults', () => {
  const c = openAiConfig({});
  assert.equal(c.baseUrl, 'https://api.openai.com/v1');
  assert.equal(c.model, 'gpt-4o-mini');
  assert.equal(c.apiKey, '');
  assert.equal(c.temperature, 0.85);
  assert.equal(c.maxTokens, 700); // director JSON (intent + all lines) needs headroom
  assert.equal(c.frequencyPenalty, 0); // penalties are opt-in (free providers degenerate)
  assert.equal(c.presencePenalty, 0);
});

test('openAiConfig: reads env + strips trailing slash from base url', () => {
  const c = openAiConfig({
    LLM_BASE_URL: 'https://openrouter.ai/api/v1/',
    LLM_API_KEY: 'sk-test',
    LLM_MODEL: 'cognitivecomputations/dolphin-mixtral',
    LLM_TEMPERATURE: '0.7',
    LLM_MAX_TOKENS: '512',
  });
  assert.equal(c.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(c.apiKey, 'sk-test');
  assert.equal(c.model, 'cognitivecomputations/dolphin-mixtral');
  assert.equal(c.temperature, 0.7);
  assert.equal(c.maxTokens, 512);
});

test('buildChatBody: wraps the prompt as a single user message', () => {
  const cfg = openAiConfig({ LLM_MODEL: 'm', LLM_TEMPERATURE: '0.5', LLM_MAX_TOKENS: '99' });
  const body = buildChatBody('hello world', cfg);
  assert.equal(body.model, 'm');
  assert.equal(body.temperature, 0.5);
  assert.equal(body.max_tokens, 99);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hello world' }]);
});

test('parseChatResponse: pulls assistant content', () => {
  assert.equal(
    parseChatResponse({ choices: [{ message: { content: 'the reply' } }] }),
    'the reply',
  );
});

test('parseChatResponse: empty string on malformed/empty payloads', () => {
  assert.equal(parseChatResponse({}), '');
  assert.equal(parseChatResponse({ choices: [] }), '');
  assert.equal(parseChatResponse(null), '');
  assert.equal(parseChatResponse({ choices: [{}] }), '');
});
