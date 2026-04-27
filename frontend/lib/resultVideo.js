function inferResultVideoKind(kind, url) {
  const value = `${kind ?? ""} ${url ?? ""}`.toLowerCase();

  if (value.includes("tracked") || value.includes("barpath") || value.includes("bar_path")) {
    return "tracked";
  }

  if (value.includes("processed") || value.includes("overlay") || value.includes("annotated")) {
    return "processed";
  }

  if (value.includes("upload") || value.includes("raw")) {
    return "raw";
  }

  return "unknown";
}

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

export function selectResultVideoLabel(resultOrKind, maybeUrl = null) {
  const kind = typeof resultOrKind === "string" ? resultOrKind : null;
  const url = typeof resultOrKind === "string"
    ? maybeUrl
    : selectResultVideoUrl(resultOrKind) ?? resultOrKind?.raw_video_url ?? resultOrKind?.video_url ?? null;

  const inferred = inferResultVideoKind(kind, url);

  if (inferred === "tracked") {
    return "Tracked bar-path video";
  }

  if (inferred === "processed") {
    return "Processed overlay video";
  }

  if (inferred === "raw") {
    return "Raw uploaded video";
  }

  return "Result video";
}
