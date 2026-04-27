import test from 'node:test';
import assert from 'node:assert/strict';
import { selectResultVideoUrl } from '../lib/resultVideo.js';

test('selectResultVideoUrl chooses selected_video_url first', () => {
  const result = selectResultVideoUrl({
    selected_video_url: '/static/processed/a_tracked.mp4',
    tracked_video_url: '/static/processed/b_tracked.mp4',
    processed_video_url: '/static/processed/c.mp4',
    overlay_video_url: '/static/overlays/d.mp4',
  });
  assert.equal(result, '/static/processed/a_tracked.mp4');
});

test('selectResultVideoUrl chooses tracked_video_url second', () => {
  const result = selectResultVideoUrl({
    tracked_video_url: '/static/processed/b_tracked.mp4',
    processed_video_url: '/static/processed/c.mp4',
    overlay_video_url: '/static/overlays/d.mp4',
  });
  assert.equal(result, '/static/processed/b_tracked.mp4');
});

test('selectResultVideoUrl chooses processed_video_url third', () => {
  const result = selectResultVideoUrl({
    processed_video_url: '/static/processed/c.mp4',
    overlay_video_url: '/static/overlays/d.mp4',
  });
  assert.equal(result, '/static/processed/c.mp4');
});

test('selectResultVideoUrl chooses overlay_video_url fourth', () => {
  const result = selectResultVideoUrl({
    overlay_video_url: '/static/overlays/d.mp4',
  });
  assert.equal(result, '/static/overlays/d.mp4');
});

test('selectResultVideoUrl returns null if only raw_video_url exists', () => {
  const result = selectResultVideoUrl({
    raw_video_url: '/static/uploads/raw.mp4',
  });
  assert.equal(result, null);
});

test('selectResultVideoUrl never returns raw_video_url', () => {
  const result = selectResultVideoUrl({
    raw_video_url: '/static/uploads/raw.mp4',
    video_url: '/static/uploads/raw2.mp4',
  });
  assert.notEqual(result, '/static/uploads/raw.mp4');
  assert.equal(result, null);
});
