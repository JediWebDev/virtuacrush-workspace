import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCompleteDirectorLines,
  streamingDirectorTranscript,
} from './stream_director';

test('extractCompleteDirectorLines: closed JSON objects only', () => {
  const partial =
    '{"lines":[{"speaker":"Lexi","text":"Hey there."},{"speaker":"narrator","text":"The room is quiet';
  const lines = extractCompleteDirectorLines(partial);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.speaker, 'Lexi');
  assert.equal(lines[0]?.text, 'Hey there.');
});

test('streamingDirectorTranscript: includes partial in-progress text', () => {
  const partial =
    '{"lines":[{"speaker":"Lexi","text":"Done."},{"speaker":"narrator","text":"She steps closer';
  const out = streamingDirectorTranscript(partial, 'Lexi');
  assert.match(out, /\[LEXI\] Done\./);
  assert.match(out, /\[NARRATOR\] She steps closer/);
});
