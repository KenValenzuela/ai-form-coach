const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export function toMediaSrc(url) {
  if (!url) return null;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${cleanUrl}?t=${Date.now()}`;
}

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

export function getDisplayVideoUrl(result, { allowRawFallback = false } = {}) {
  if (!result) return null;

  const finalResolved = (
    result.final_video_url
    ?? result.tracked_video_url
    ?? result.processed_video_url
    ?? result.display_video_url
    ?? result.selected_video_url
    ?? null
  );

  if (finalResolved) return finalResolved;
  if (allowRawFallback) return result.raw_video_url ?? result.video_url ?? null;
  return null;
}

export function selectResultVideoUrl(result) {
  return getDisplayVideoUrl(result);
}

export function selectResultVideoLabel(resultOrKind, maybeUrl = null) {
  const kind = typeof resultOrKind === "string" ? resultOrKind : null;
  const url = typeof resultOrKind === "string"
    ? maybeUrl
    : getDisplayVideoUrl(resultOrKind, { allowRawFallback: true });

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
