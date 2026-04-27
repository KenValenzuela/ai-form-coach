import test from "node:test";
import assert from "node:assert/strict";
import { selectResultVideoUrl } from "../lib/resultVideo.js";

test("chooses display_video_url first", () => {
  const result = selectResultVideoUrl({
    display_video_url: "/static/tracking/a_tracked.mp4",
    selected_video_url: "/static/processed/a_tracked.mp4",
    tracked_video_url: "/static/processed/b_tracked.mp4",
    processed_video_url: "/static/processed/c.mp4",
    overlay_video_url: "/static/overlays/d.mp4",
  });
  assert.equal(result, "/static/tracking/a_tracked.mp4");
});

test("chooses tracked_video_url second", () => {
  const result = selectResultVideoUrl({
    selected_video_url: null,
    tracked_video_url: "/static/processed/b_tracked.mp4",
    processed_video_url: "/static/processed/c.mp4",
    overlay_video_url: "/static/overlays/d.mp4",
  });
  assert.equal(result, "/static/processed/b_tracked.mp4");
});

test("chooses processed_video_url third", () => {
  const result = selectResultVideoUrl({
    selected_video_url: null,
    tracked_video_url: null,
    processed_video_url: "/static/processed/c.mp4",
    overlay_video_url: "/static/overlays/d.mp4",
  });
  assert.equal(result, "/static/processed/c.mp4");
});

test("chooses overlay_video_url fourth", () => {
  const result = selectResultVideoUrl({
    selected_video_url: null,
    tracked_video_url: null,
    processed_video_url: null,
    overlay_video_url: "/static/overlays/d.mp4",
  });
  assert.equal(result, "/static/overlays/d.mp4");
});

test("never chooses raw_video_url", () => {
  const result = selectResultVideoUrl({
    selected_video_url: null,
    tracked_video_url: null,
    processed_video_url: null,
    overlay_video_url: null,
    raw_video_url: "/static/uploads/raw.mp4",
  });
  assert.equal(result, null);
});
