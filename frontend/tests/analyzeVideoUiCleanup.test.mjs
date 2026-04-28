import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/AnalyzeSection.tsx', import.meta.url), 'utf8');

test('video tab keeps professional processed label', () => {
  assert.match(source, /Processed \/ Tracked Result/);
});

test('video url debug panel is removed from user-facing markup', () => {
  assert.doesNotMatch(source, /Video URL Debug/);
  assert.doesNotMatch(source, /actual player src:/);
});

test('original upload preview section is removed', () => {
  assert.doesNotMatch(source, /Original Upload/);
});
