import test from "node:test";
import assert from "node:assert/strict";
import { getDisplayVideoUrl, selectResultVideoUrl } from "../lib/resultVideo.js";

test("chooses tracked_video_url first", () => {
  const result = selectResultVideoUrl({
    tracked_video_url: "/static/tracking/a_tracked.mp4",
    processed_video_url: "/static/processed/c.mp4",
    final_video_url: "/static/processed/final.mp4",
  });
  assert.equal(result, "/static/tracking/a_tracked.mp4");
});

test("chooses processed_video_url second", () => {
  const result = selectResultVideoUrl({
    tracked_video_url: null,
    processed_video_url: "/static/processed/c.mp4",
    final_video_url: "/static/processed/final.mp4",
  });
  assert.equal(result, "/static/processed/c.mp4");
});

test("chooses final_video_url third", () => {
  const result = getDisplayVideoUrl({
    tracked_video_url: null,
    processed_video_url: null,
    final_video_url: "/static/processed/final.mp4",
  });
  assert.equal(result, "/static/processed/final.mp4");
});

test("never chooses raw_video_url by default", () => {
  const result = selectResultVideoUrl({
    tracked_video_url: null,
    processed_video_url: null,
    final_video_url: null,
    raw_video_url: "/static/uploads/raw.mp4",
  });
  assert.equal(result, null);
});

test("returns raw fallback only when explicitly enabled", () => {
  const result = getDisplayVideoUrl(
    {
      tracked_video_url: null,
      processed_video_url: null,
      final_video_url: null,
      raw_video_url: "/static/uploads/raw.mp4",
    },
    { allowRawFallback: true },
  );
  assert.equal(result, "/static/uploads/raw.mp4");
});
