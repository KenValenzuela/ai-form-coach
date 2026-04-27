export function selectResultVideoUrl(result) {
  if (!result) return null;
  return (
    result.selected_video_url
    ?? result.tracked_video_url
    ?? result.processed_video_url
    ?? result.overlay_video_url
    ?? null
  );
}
