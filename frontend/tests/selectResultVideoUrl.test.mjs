import test from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayVideoUrl, selectResultVideoUrl } from '../lib/resultVideo.js';

test('getDisplayVideoUrl chooses tracked_video_url first', () => {
  const result = selectResultVideoUrl({
    tracked_video_url: '/static/tracking/a_tracked.mp4',
    processed_video_url: '/static/processed/c.mp4',
    final_video_url: '/static/processed/final.mp4',
  });
  assert.equal(result, '/static/tracking/a_tracked.mp4');
});

test('getDisplayVideoUrl chooses processed_video_url second', () => {
  const result = selectResultVideoUrl({
    tracked_video_url: null,
    processed_video_url: '/static/processed/c.mp4',
    final_video_url: '/static/processed/final.mp4',
  });
  assert.equal(result, '/static/processed/c.mp4');
});

test('getDisplayVideoUrl chooses final_video_url third', () => {
  const result = getDisplayVideoUrl({
    tracked_video_url: null,
    processed_video_url: null,
    final_video_url: '/static/processed/final.mp4',
  });
  assert.equal(result, '/static/processed/final.mp4');
});

test('selectResultVideoUrl returns null if only raw_video_url exists', () => {
  const result = selectResultVideoUrl({
    raw_video_url: '/static/uploads/raw.mp4',
  });
  assert.equal(result, null);
});

test('getDisplayVideoUrl returns raw only when allowRawFallback=true', () => {
  const noFallback = getDisplayVideoUrl({
    raw_video_url: '/static/uploads/raw.mp4',
    video_url: '/static/uploads/raw2.mp4',
  });
  assert.equal(noFallback, null);
  const withFallback = getDisplayVideoUrl({
    raw_video_url: '/static/uploads/raw.mp4',
    video_url: '/static/uploads/raw2.mp4',
  }, { allowRawFallback: true });
  assert.equal(withFallback, '/static/uploads/raw.mp4');
});
