"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { selectIdentityForHandle, type KeyedIdentity } from "./identity.js";
import { parseUploadResponse } from "./liveData.js";

type LeaderboardScope = "city" | "artist" | "venue";
type AttendanceStatus = "interested" | "going" | "logged";

type HookArgs = {
  handle?: string;
  homeCity?: string;
  visibility?: "public" | "private";
  selectedShowId?: string;
  selectedArtistId?: string;
  selectedVenueId?: string;
  selectedMatchUserId?: string;
  query: string;
  leaderboardScope: LeaderboardScope;
  activityScope?: "friends" | "you";
};

type SaveLogInput = {
  showId: Id<"shows">;
  rating: number;
  vibes: string[];
  review?: string;
  caption?: string;
  song?: string;
  file?: File;
};

function localDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function useShowtonic({
  handle,
  homeCity,
  visibility,
  selectedShowId,
  selectedArtistId,
  selectedVenueId,
  selectedMatchUserId,
  query,
  leaderboardScope,
  activityScope = "friends",
}: HookArgs) {
  const [identity, setIdentity] = useState<KeyedIdentity<Doc<"users">>>({
    handle: undefined,
    user: null,
    error: "",
  });
  const [operation, setOperation] = useState<"idle" | "saving" | "uploading">("idle");
  const getOrCreateUser = useMutation(api.users.getOrCreate);
  const setAttendanceMutation = useMutation(api.attendance.set);
  const createLog = useMutation(api.logs.create);
  const generateUploadUrl = useMutation(api.media.generateUploadUrl);
  const attachMedia = useMutation(api.media.attach);
  const toggleArtistFollowMutation = useMutation(api.follows.toggleArtist);
  const toggleVenueFollowMutation = useMutation(api.follows.toggleVenue);
  const toggleWatchlistMutation = useMutation(api.watchlist.toggle);
  const setFavoritesMutation = useMutation(api.favorites.set);
  const toggleReviewLikeMutation = useMutation(api.activity.toggleLike);
  const syncCatalogAction = useAction(api.jambase.syncCatalog);
  const syncFreeCatalogAction = useAction(api.freeEvents.syncFreeCatalog);
  const enrichArtistsAction = useAction(api.freeEvents.enrichArtists);
  const today = localDate();

  useEffect(() => {
    let active = true;

    if (!handle) {
      return () => {
        active = false;
      };
    }

    getOrCreateUser({ handle, homeCity, visibility })
      .then((nextUser) => {
        if (active && nextUser) {
          setIdentity({ handle, user: nextUser, error: "" });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setIdentity({
            handle,
            user: null,
            error: error instanceof Error ? error.message : "Could not create local user",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [getOrCreateUser, handle, homeCity, visibility]);

  const { user, error: identityError } = selectIdentityForHandle(handle, identity);
  const userId = user?._id;
  const discovery = useQuery(api.discovery.home, userId ? { userId, today } : "skip");
  const searchResults = useQuery(
    api.discovery.search,
    userId && query.trim() ? { userId, query } : "skip",
  );
  const showDetail = useQuery(
    api.shows.detail,
    userId && selectedShowId
      ? { userId, showId: selectedShowId as Id<"shows"> }
      : "skip",
  );
  const diary = useQuery(api.diary.forUser, userId ? { userId } : "skip");
  const profile = useQuery(api.diary.profile, userId ? { userId } : "skip");
  const leaderboard = useQuery(
    api.leaderboard.list,
    userId ? { userId, scope: leaderboardScope } : "skip",
  );
  const tasteMatches = useQuery(api.taste.similar, userId ? { userId } : "skip");
  const activityFeed = useQuery(
    api.activity.feed,
    userId ? { userId, scope: activityScope } : "skip",
  );
  const tasteMatchDetail = useQuery(
    api.taste.matchDetail,
    userId && selectedMatchUserId
      ? { userId, otherUserId: selectedMatchUserId as Id<"users"> }
      : "skip",
  );
  const artistDetail = useQuery(
    api.artists.get,
    userId && selectedArtistId
      ? { userId, artistId: selectedArtistId as Id<"artists"> }
      : "skip",
  );
  const venueDetail = useQuery(
    api.venues.get,
    userId && selectedVenueId
      ? { userId, venueId: selectedVenueId as Id<"venues"> }
      : "skip",
  );

  async function toggleArtistFollow(artistId: Id<"artists">) {
    if (!userId) throw new Error("Local user is still loading");
    return toggleArtistFollowMutation({ userId, artistId });
  }

  async function toggleVenueFollow(venueId: Id<"venues">) {
    if (!userId) throw new Error("Local user is still loading");
    return toggleVenueFollowMutation({ userId, venueId });
  }

  async function toggleWatchlist(targetType: "show" | "artist" | "venue", targetId: string) {
    if (!userId) throw new Error("Local user is still loading");
    return toggleWatchlistMutation({ userId, targetType, targetId });
  }

  async function toggleReviewLike(logId: Id<"logs">) {
    if (!userId) throw new Error("Local user is still loading");
    return toggleReviewLikeMutation({ userId, logId });
  }

  async function setFavorites(logIds: Id<"logs">[]) {
    if (!userId) throw new Error("Local user is still loading");
    return setFavoritesMutation({ userId, logIds });
  }

  async function setAttendance(showId: Id<"shows">, status: AttendanceStatus) {
    if (!userId) {
      throw new Error("Local user is still loading");
    }
    await setAttendanceMutation({ userId, showId, status });
  }

  async function attachFile(logId: Id<"logs">, showId: Id<"shows">, file: File, caption?: string) {
    if (!userId) {
      throw new Error("Local user is still loading");
    }
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Media upload failed with status ${response.status}`);
    }
    const storageId = parseUploadResponse(await response.json()) as Id<"_storage">;
    await attachMedia({
      logId,
      userId,
      showId,
      storageId,
      contentType: file.type,
      caption,
    });
  }

  async function saveLog(input: SaveLogInput) {
    if (!userId) {
      throw new Error("Local user is still loading");
    }
    setOperation("saving");
    const logId = await createLog({
      userId,
      showId: input.showId,
      rating: input.rating,
      vibes: input.vibes,
      note: input.review?.trim() || undefined,
      caption: input.caption?.trim() || undefined,
      song: input.song?.trim() || undefined,
    });

    if (!input.file) {
      setOperation("idle");
      return { logId };
    }

    setOperation("uploading");
    try {
      await attachFile(logId, input.showId, input.file, input.caption);
      return { logId };
    } catch (error) {
      return {
        logId,
        mediaError: error instanceof Error ? error.message : "Media upload failed",
      };
    } finally {
      setOperation("idle");
    }
  }

  async function retryMedia(
    logId: Id<"logs">,
    showId: Id<"shows">,
    file: File,
    caption?: string,
  ) {
    setOperation("uploading");
    try {
      await attachFile(logId, showId, file, caption);
    } finally {
      setOperation("idle");
    }
  }

  // Unified sync result so the UI renders the same status for either source.
  type CatalogSyncResult = {
    source: "jambase" | "free";
    historical: { fetched: number };
    upcoming: { fetched: number };
    historicalMode: "city" | "artists";
    historicalFallbackReason?: string;
  };

  // JamBase while the trial is live; when it fails (expired key / 401 / 403 /
  // network), fall back to the free stack (Ticketmaster + Setlist.fm) so the
  // Sync control keeps working. See docs/FREE_DATA.md.
  async function syncCatalog(): Promise<CatalogSyncResult> {
    try {
      const result = await syncCatalogAction({
        cityId: "jambase:4226966",
        cityName: "San Francisco",
        today,
        historyDays: 365,
        maxPagesPerRange: 30,
        reconcileHistorical: true,
      });
      return { source: "jambase", ...result };
    } catch (jambaseError) {
      const free = await syncFreeCatalogAction({
        city: "San Francisco",
        today,
        historyDays: 365,
        maxPagesPerRange: 10,
      });
      // Free upcoming creates stub artists — enrich art/genres best-effort.
      void enrichArtistsAction({ limit: 50 }).catch(() => undefined);
      return {
        source: "free",
        historical: { fetched: free.historical.fetched },
        upcoming: { fetched: free.upcoming.fetched },
        historicalMode: "artists",
        historicalFallbackReason: `JamBase unavailable (${
          jambaseError instanceof Error ? jambaseError.message : "error"
        }) — used free sources: Ticketmaster + Setlist.fm`,
      };
    }
  }

  // Force the free path regardless of JamBase (post-trial default).
  async function syncFreeCatalog(): Promise<CatalogSyncResult> {
    const free = await syncFreeCatalogAction({
      city: "San Francisco",
      today,
      historyDays: 365,
      maxPagesPerRange: 10,
    });
    void enrichArtistsAction({ limit: 50 }).catch(() => undefined);
    return {
      source: "free",
      historical: { fetched: free.historical.fetched },
      upcoming: { fetched: free.upcoming.fetched },
      historicalMode: "artists",
    };
  }

  return {
    activityFeed: activityFeed ?? [],
    artistDetail,
    diary,
    discovery,
    identityError,
    isIdentityLoading: Boolean(handle) && !user && !identityError,
    leaderboard,
    operation,
    profile,
    retryMedia,
    searchResults: searchResults ?? [],
    setAttendance,
    showDetail,
    syncCatalog,
    syncFreeCatalog,
    tasteMatches: tasteMatches ?? [],
    tasteMatchDetail,
    toggleReviewLike,
    setFavorites,
    toggleArtistFollow,
    toggleVenueFollow,
    toggleWatchlist,
    user,
    venueDetail,
    saveLog,
    attachFile,
  };
}
