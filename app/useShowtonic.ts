"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { selectIdentityForHandle, type KeyedIdentity } from "./identity.js";
import { parseUploadResponse } from "./liveData.js";

type LeaderboardScope = "city" | "artist" | "venue";
type AttendanceStatus = "interested" | "going" | "logged";

type HookArgs = {
  handle?: string;
  selectedShowId?: string;
  selectedArtistId?: string;
  selectedVenueId?: string;
  query: string;
  leaderboardScope: LeaderboardScope;
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

export function useShowtonic({
  handle,
  selectedShowId,
  selectedArtistId,
  selectedVenueId,
  query,
  leaderboardScope,
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

  useEffect(() => {
    let active = true;

    if (!handle) {
      return () => {
        active = false;
      };
    }

    getOrCreateUser({ handle })
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
  }, [getOrCreateUser, handle]);

  const { user, error: identityError } = selectIdentityForHandle(handle, identity);
  const userId = user?._id;
  const discovery = useQuery(api.discovery.home, userId ? { userId } : "skip");
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
  const artistDetail = useQuery(
    api.artists.get,
    userId && selectedArtistId ? { artistId: selectedArtistId as Id<"artists"> } : "skip",
  );
  const venueDetail = useQuery(
    api.venues.get,
    userId && selectedVenueId ? { venueId: selectedVenueId as Id<"venues"> } : "skip",
  );

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

  return {
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
    tasteMatches: tasteMatches ?? [],
    user,
    venueDetail,
    saveLog,
    attachFile,
  };
}
