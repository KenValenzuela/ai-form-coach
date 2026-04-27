export function selectResultVideoUrl(result) {
  return (
    result?.selected_video_url ||
    result?.tracked_video_url ||
    result?.processed_video_url ||
    result?.overlay_video_url ||
    null
  );
}

export function selectResultVideoLabel(result) {
  if (result?.selected_video_url || result?.tracked_video_url) {
    return "Tracked processed video";
  }
  if (result?.processed_video_url) {
    return "Processed tracking result";
  }
  if (result?.overlay_video_url) {
    return "Overlay result";
  }
  return "No processed result";
}
