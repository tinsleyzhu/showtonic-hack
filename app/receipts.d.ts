export function describeArtistHistory(
  history: { showCount: number; firstSeenYear?: string | null; averageRating?: number | null } | null,
  artistName: string,
): string;

export function describeVenueHistory(
  history: {
    showCount: number;
    rank?: number;
    lastSeen?: { artistName: string; date: string } | null;
  } | null,
): string;
