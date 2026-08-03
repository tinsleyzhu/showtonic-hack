const HANDLE_KEY = "showtonic.handle";

const SHOW_IMAGES = {
  "Charli XCX":
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=80",
  "RÜFÜS DU SOL":
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80",
  Doechii:
    "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1400&q=80",
  "The Strokes":
    "https://images.unsplash.com/photo-1508973379184-7517410fb0bc?auto=format&fit=crop&w=1400&q=80",
  "Vampire Weekend":
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1400&q=80",
  "Jamie xx":
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1400&q=80",
};

const DEFAULT_SHOW_IMAGE =
  "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1400&q=80";

function normalizeHandle(value) {
  const handle = String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  return handle || "tinsley";
}

function getStoredHandle(storage) {
  const handle = normalizeHandle(storage.getItem(HANDLE_KEY));
  storage.setItem(HANDLE_KEY, handle);
  return handle;
}

function parseUploadResponse(value) {
  if (!value || typeof value.storageId !== "string" || !value.storageId) {
    throw new Error("Convex upload response is missing storageId");
  }
  return value.storageId;
}

function resolveShowImage(image, artistNames = []) {
  if (typeof image === "string" && /^https?:\/\//.test(image)) {
    return image;
  }
  return SHOW_IMAGES[artistNames[0]] ?? DEFAULT_SHOW_IMAGE;
}

function toShow(summary) {
  return {
    id: String(summary.id ?? summary._id),
    title: summary.title,
    date: summary.date,
    day: summary.day ?? "Date TBA",
    time: summary.time ?? "Time TBA",
    stage: summary.stage ?? "Stage TBA",
    venueId: summary.venueId ? String(summary.venueId) : "",
    venueName: summary.venueName,
    city: summary.city,
    region: summary.region,
    artistIds: (summary.artistIds ?? []).map(String),
    artistNames: summary.artistNames ?? [],
    image: resolveShowImage(summary.image, summary.artistNames),
    jambaseUrl: summary.jambaseUrl ?? "",
    ticketUrl: summary.ticketUrl,
    memoryPrompt: summary.memoryPrompt ?? "What moment will you remember?",
    festivalId: summary.festivalId,
    isJamBase:
      typeof summary.isJamBase === "boolean"
        ? summary.isJamBase
        : String(summary.jambaseId ?? "").startsWith("jambase:"),
    rating: summary.rating ?? 0,
    ratingCount: summary.ratingCount ?? 0,
    interestedCount: summary.interestedCount ?? 0,
    goingCount: summary.goingCount ?? 0,
    loggedCount: summary.loggedCount ?? 0,
    attendanceStatus: summary.attendanceStatus,
  };
}

function toMemory(log) {
  const uploadedPhoto = (log.media ?? []).find(
    (item) => item.kind === "photo" && typeof item.url === "string" && item.url,
  )?.url;
  return {
    id: String(log._id ?? log.id),
    showId: String(log.showId),
    rating: log.rating,
    note: log.note ?? "",
    caption: log.caption ?? log.note ?? "Live memory",
    song: log.song ?? "",
    vibes: log.vibes ?? [],
    photo: uploadedPhoto ?? resolveShowImage(log.showImage, log.artistNames),
    date: log.showDate,
    artistNames: log.artistNames ?? [],
    artistGenres: log.artistGenres ?? [],
    venueName: log.venueName ?? "Venue",
    city: log.city ?? "City",
  };
}

function filterMemories(memories, filter) {
  const persisted = memories.filter((memory) => memory && memory.id);
  if (filter === "Rating") {
    return [...persisted].sort(
      (left, right) => right.rating - left.rating || right.date.localeCompare(left.date),
    );
  }
  if (filter === "Photo") {
    return persisted
      .filter((memory) => Boolean(memory.photo))
      .sort((left, right) => right.date.localeCompare(left.date));
  }
  const field = {
    Artist: (memory) => memory.artistNames?.[0] ?? "",
    City: (memory) => memory.city ?? "",
    Genre: (memory) => memory.artistGenres?.[0] ?? "",
    Venue: (memory) => memory.venueName ?? "",
  }[filter];
  if (field) {
    return [...persisted].sort(
      (left, right) =>
        field(left).localeCompare(field(right)) ||
        right.rating - left.rating ||
        right.date.localeCompare(left.date),
    );
  }
  return [...persisted].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || String(left.id).localeCompare(String(right.id)),
  );
}

function groupMemories(memories, filter) {
  const keysFor = {
    Artist: (memory) => memory.artistNames ?? [],
    City: (memory) => [memory.city ?? "Unknown city"],
    Genre: (memory) => memory.artistGenres?.length ? memory.artistGenres : ["Other"],
    Rating: (memory) => [`${memory.rating} stars`],
    Venue: (memory) => [memory.venueName ?? "Unknown venue"],
  }[filter];
  if (!keysFor) return [];

  const grouped = new Map();
  for (const memory of memories.filter((item) => item?.id)) {
    for (const label of new Set(keysFor(memory).filter(Boolean))) {
      const bucket = grouped.get(label) ?? [];
      bucket.push(memory);
      grouped.set(label, bucket);
    }
  }

  return [...grouped.entries()]
    .map(([label, items]) => {
      const sorted = [...items].sort(
        (left, right) => right.date.localeCompare(left.date) || right.rating - left.rating,
      );
      return {
        key: String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        count: sorted.length,
        latestDate: sorted[0]?.date ?? "",
        memories: sorted,
      };
    })
    .sort(
      (left, right) =>
        right.latestDate.localeCompare(left.latestDate) || left.label.localeCompare(right.label),
    );
}

function describeSaveResult(result) {
  if (result.mediaError) {
    return {
      saved: true,
      phase: "saved-with-media-error",
      message: result.mediaError,
    };
  }
  return {
    saved: true,
    phase: "saved",
    message: "Show saved to your diary.",
  };
}

export {
  describeSaveResult,
  filterMemories,
  groupMemories,
  getStoredHandle,
  normalizeHandle,
  parseUploadResponse,
  resolveShowImage,
  toMemory,
  toShow,
};
