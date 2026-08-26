"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Onboarding } from "./OnboardingFlow";
import { describeSaveResult, toMemory } from "./liveData.js";
import { activeTab } from "./navigation.js";
import type { OnboardingIntent, OnboardingProfile } from "./onboarding.d";
import {
  findFirstHistoricalPreferredShow,
  markOnboardingSignedOut,
  readOnboardingProfile,
  validateOnboardingHandle,
  writeLoginProfile,
  writeOnboardingProfile,
} from "./onboarding.js";
import { useShowtonic } from "./useShowtonic";
import { ActivityView } from "./views/ActivityView";
import { BackfillFlow } from "./views/BackfillFlow";
import { DiscoverView } from "./views/DiscoverView";
import { ArtistView, ArtistsDirectoryView, VenueView, VenuesDirectoryView } from "./views/EntityViews";
import { ProfileView } from "./views/ProfileView";
import { ShowView } from "./views/ShowView";
import { TasteMatchView } from "./views/TasteMatchView";
import { Header, TabBar } from "./views/TabBar";
import {
  adaptShow,
  nearestHomeCity,
  StatusPanel,
  todayIso,
  tracksFor,
  type Attendance,
  type CatalogMode,
  type DiaryFilter,
  type View,
} from "./views/shared";

// v1.5 social flag — the Activity tab renders only when this is on AND the
// surface has real content (empty-room rule; see FEATURES.md).
const SOCIAL_ENABLED = true;

export default function Home() {
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const [pendingOnboardingIntent, setPendingOnboardingIntent] = useState<OnboardingIntent | null>(null);
  const [view, setView] = useState<View>("discover");
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("upcoming");
  const [cameFrom, setCameFrom] = useState("discover");
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [diaryFilter, setDiaryFilter] = useState<DiaryFilter>("Wall");
  const [leaderScope, setLeaderScope] = useState<"city" | "artist" | "venue">("city");
  const [activityScope, setActivityScope] = useState<"friends" | "you">("friends");
  const [selectedMatchUserId, setSelectedMatchUserId] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [morningAfterDismissed, setMorningAfterDismissed] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>(["transcendent"]);
  const [selectedSong, setSelectedSong] = useState("");
  // Local-first media (design 18): moments stay on-device; only the one chosen
  // memory poster uploads and becomes the diary tile.
  const [moments, setMoments] = useState<{ file: File; url: string }[]>([]);
  const [posterIndex, setPosterIndex] = useState(0);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("");
  const [homeCity, setHomeCity] = useState("San Francisco");
  const [locationStatus, setLocationStatus] = useState("Using your saved home base");
  const [pendingMedia, setPendingMedia] = useState<{
    logId: Id<"logs">;
    showId: Id<"shows">;
    file: File;
    caption?: string;
  }>();
  const loginUser = useMutation(api.users.login);

  const live = useShowtonic({
    handle: onboardingProfile?.completed ? onboardingProfile.handle : undefined,
    homeCity: onboardingProfile?.homeCity || undefined,
    visibility: onboardingProfile?.visibility,
    selectedShowId,
    selectedArtistId,
    selectedVenueId,
    selectedMatchUserId,
    query: deferredQuery,
    leaderboardScope: leaderScope,
    activityScope,
  });

  const shows = useMemo(
    () => (live.discovery?.shows ?? []).map((show) => adaptShow(show)),
    [live.discovery],
  );
  const memories = useMemo(
    () => (live.diary?.logs ?? []).map((log) => toMemory(log as Record<string, unknown>)),
    [live.diary],
  );
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- The client-only storage read is the onboarding gate's source of truth.
      setOnboardingProfile(readOnboardingProfile(window.localStorage));
    } catch {
      setOnboardingProfile(readOnboardingProfile());
    }
  }, []);

  useEffect(() => {
    if (!onboardingProfile?.completed || shows.length === 0) return;

    const available = [...new Set(shows.map((show) => show.city).filter(Boolean))] as string[];

    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("showtonic.homeCity");
    } catch {
      // Continue with the in-memory default when storage is unavailable.
    }
    if (saved && available.includes(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the client-only home base from browser storage.
      setHomeCity(saved);
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("Location unavailable · defaulting to San Francisco");
      return;
    }
    setLocationStatus("Finding your nearest show city...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const city = nearestHomeCity(coords.latitude, coords.longitude, available);
        setHomeCity(city);
        try {
          window.localStorage.setItem("showtonic.homeCity", city);
        } catch {
          // The in-memory home base still works when storage is unavailable.
        }
        setLocationStatus("Home base set from this device");
      },
      () => setLocationStatus("Location not shared · defaulting to San Francisco"),
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 8_000 },
    );
  }, [onboardingProfile?.completed, shows]);

  useEffect(() => {
    return () => {
      for (const moment of moments) URL.revokeObjectURL(moment.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount; clearMoments handles the rest.
  }, []);

  useEffect(() => {
    if (pendingOnboardingIntent === "explore") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Explore completes directly on the Discover view.
      setView("discover");
      setPendingOnboardingIntent(null);
      return;
    }
    if (pendingOnboardingIntent === "backfill") {
      if (!onboardingProfile?.completed || shows.length === 0) return;
      setBackfillOpen(true);
      setPendingOnboardingIntent(null);
      return;
    }
    if (pendingOnboardingIntent !== "log" || !onboardingProfile?.completed || shows.length === 0) {
      return;
    }

    const firstShow = findFirstHistoricalPreferredShow(
      shows,
      onboardingProfile.favoriteArtists,
      todayIso(),
    );
    if (!firstShow) {
      setView("discover");
      setNotice("No past shows are ready to log yet. Sync JamBase or browse the past catalog.");
      setPendingOnboardingIntent(null);
      return;
    }

    setSelectedShowId(firstShow.id);
    setSelectedSong(tracksFor(firstShow.artistNames?.[0])[0]);
    setLogOpen(true);
    setView("show");
    setPendingOnboardingIntent(null);
    window.scrollTo({ top: 0 });
  }, [onboardingProfile, pendingOnboardingIntent, shows]);

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function handleTab(destination: { view: View; catalogMode: CatalogMode }, tab: string) {
    setCatalogMode(destination.catalogMode);
    setCameFrom(tab);
    navigate(destination.view);
  }

  function completeOnboarding(profile: OnboardingProfile, intent: OnboardingIntent) {
    let nextProfile: OnboardingProfile;
    try {
      nextProfile = writeOnboardingProfile(window.localStorage, profile);
    } catch {
      nextProfile = writeOnboardingProfile(undefined, profile);
    }

    setOnboardingProfile(nextProfile);
    setPendingOnboardingIntent(nextProfile.completed ? intent : null);
  }

  async function loginReturningUser(value: string) {
    const validation = validateOnboardingHandle(value);
    if (validation.error) return validation.error;

    try {
      const user = await loginUser({ handle: validation.handle });
      if (!user) return "We could not find that handle. Check the spelling or start a new diary.";

      let nextProfile: OnboardingProfile;
      try {
        nextProfile = writeLoginProfile(
          window.localStorage,
          user.handle,
          onboardingProfile?.favoriteArtists,
        );
      } catch {
        nextProfile = writeLoginProfile(undefined, user.handle, onboardingProfile?.favoriteArtists);
      }
      setOnboardingProfile(nextProfile);
      setPendingOnboardingIntent("explore");
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Could not log in right now.";
    }
  }

  function signOut() {
    const current = onboardingProfile ?? {
      completed: false,
      handle: live.user?.handle ?? "tinsley",
      favoriteArtists: [],
      homeCity: "",
      visibility: "public" as const,
    };
    let nextProfile: OnboardingProfile;
    try {
      nextProfile = markOnboardingSignedOut(window.localStorage, current);
    } catch {
      nextProfile = markOnboardingSignedOut(undefined, current);
    }
    setOnboardingProfile(nextProfile);
    setPendingOnboardingIntent(null);
    setView("discover");
  }

  function openShow(showId: string, openLogger = false) {
    const show = shows.find((item) => item.id === showId);
    setSelectedShowId(showId);
    setSelectedSong(tracksFor(show?.artistNames?.[0])[0]);
    setLogOpen(openLogger && Boolean(show && show.date < todayIso()));
    setCameFrom(activeTab(view, { catalogMode, cameFrom }));
    navigate("show");
  }

  function changeHomeCity(city: string) {
    setHomeCity(city);
    try {
      window.localStorage.setItem("showtonic.homeCity", city);
    } catch {
      // Keep the user-selected city in memory when storage is unavailable.
    }
    setLocationStatus("Home base selected by you");
  }

  function openArtist(artistId: string) {
    setSelectedArtistId(artistId);
    navigate("artist");
  }

  function openVenue(venueId: string) {
    setSelectedVenueId(venueId);
    navigate("venue");
  }

  function addMoments(files: FileList | null) {
    if (!files?.length) return;
    const added = [...files].map((file) => ({ file, url: URL.createObjectURL(file) }));
    setMoments((current) => [...current, ...added]);
  }

  function clearMoments() {
    setMoments((current) => {
      for (const moment of current) URL.revokeObjectURL(moment.url);
      return [];
    });
    setPosterIndex(0);
  }

  function toggleVibe(vibe: string) {
    setSelectedVibes((current) =>
      current.includes(vibe) ? current.filter((item) => item !== vibe) : [...current, vibe],
    );
  }

  async function setAttendance(status: Attendance) {
    if (!selectedShowId || live.operation !== "idle") return;
    setFormError("");
    try {
      await live.setAttendance(selectedShowId as Id<"shows">, status);
      if (status === "logged") setLogOpen(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not update attendance");
    }
  }

  async function submitLog() {
    if (!selectedShowId || live.operation !== "idle") return;
    setFormError("");
    setNotice("");
    try {
      const posterFile = moments[posterIndex]?.file;
      const result = await live.saveLog({
        showId: selectedShowId as Id<"shows">,
        rating,
        vibes: selectedVibes,
        review,
        caption,
        song: selectedSong,
        file: posterFile,
      });
      const saveResult = describeSaveResult({
        logId: result.logId,
        mediaError: result.mediaError,
      });
      setLogOpen(false);
      setReview("");
      setCaption("");
      setSelectedVibes(["transcendent"]);
      if (result.mediaError && posterFile) {
        setPendingMedia({
          logId: result.logId,
          showId: selectedShowId as Id<"shows">,
          file: posterFile,
          caption: caption.trim() || undefined,
        });
        setNotice(`Show saved. Poster needs a retry: ${saveResult.message}`);
      } else {
        setPendingMedia(undefined);
        setNotice(saveResult.message);
      }
      clearMoments();
      navigate("profile");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save this show");
    }
  }

  async function retryPoster() {
    if (!pendingMedia || live.operation !== "idle") return;
    try {
      await live.retryMedia(
        pendingMedia.logId,
        pendingMedia.showId,
        pendingMedia.file,
        pendingMedia.caption,
      );
      setPendingMedia(undefined);
      setNotice("Poster attached to your saved show.");
    } catch (error) {
      setNotice(
        `Show is still saved. Poster retry failed: ${
          error instanceof Error ? error.message : "Upload failed"
        }`,
      );
    }
  }

  async function syncJamBase() {
    setCatalogStatus("Syncing past year + upcoming...");
    try {
      const result = await live.syncCatalog();
      setCatalogStatus(
        `JamBase synced · ${result.historical.fetched} ${result.historicalMode === "city" ? "citywide" : "lineup-scoped"} past / ${result.upcoming.fetched} upcoming${result.historicalFallbackReason ? ` · ${result.historicalFallbackReason}` : ""}`,
      );
    } catch (error) {
      setCatalogStatus(error instanceof Error ? error.message : "JamBase sync failed");
    }
  }

  if (onboardingProfile === null) {
    return <StatusPanel title="Preparing your first set" detail="Setting up your local music diary..." loading />;
  }
  if (!onboardingProfile.completed) {
    return <Onboarding initialProfile={onboardingProfile} onComplete={completeOnboarding} onLogin={loginReturningUser} />;
  }

  if (live.identityError) {
    return <StatusPanel title="Could not create your local profile" detail={live.identityError} />;
  }
  if (live.isIdentityLoading || live.discovery === undefined) {
    return <StatusPanel title="Opening your show diary" detail="Connecting to Convex..." loading />;
  }
  if (shows.length === 0) {
    return (
      <StatusPanel
        title="The lineup is ready to seed"
        detail="Run npx convex run seed:run, then reload this page."
      />
    );
  }

  const hasSocialContent =
    (live.leaderboard?.rows.length ?? 0) > 0 || live.tasteMatches.length > 0;

  // Morning-after prompt (FEATURES §2): a show you were going to ended
  // yesterday — one tap to log it.
  const yesterday = (() => {
    const date = new Date(`${todayIso()}T12:00:00`);
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  })();
  const morningAfterShow = morningAfterDismissed
    ? undefined
    : shows.find(
        (show) =>
          (show.attendanceStatus === "going" || show.attendanceStatus === "interested") &&
          show.date === yesterday,
      );

  return (
    <main className="min-h-screen bg-[#0A0908] pb-24 text-[#F5F1E8]">
      <Header
        handle={live.user?.handle ?? "tinsley"}
        onLogo={() => handleTab({ view: "discover", catalogMode: "upcoming" }, "discover")}
        onProfile={() => handleTab({ view: "profile", catalogMode: "upcoming" }, "diary")}
      />

      {morningAfterShow && view !== "show" && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 border border-[#FF7A50]/50 bg-[#1A120D] px-4 py-3 text-sm">
            <span>
              <b>{morningAfterShow.artistNames?.[0] ?? morningAfterShow.title}</b> last night? One tap to log it.
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button className="bg-[#FF7A50] px-3 py-2 text-xs font-black text-black" onClick={() => openShow(morningAfterShow.id, true)} type="button">
                Log it
              </button>
              <button className="border border-[#2A2521] px-3 py-2 text-xs font-black text-[#8A8177]" onClick={() => setMorningAfterDismissed(true)} type="button">
                Not now
              </button>
            </span>
          </div>
        </div>
      )}

      {notice && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 border border-[#4EC98F] bg-[#15251C] px-4 py-3 text-sm text-[#BFE8D2]">
            <span>{notice}</span>
            {pendingMedia && (
              <button
                className="shrink-0 border border-[#4EC98F] px-3 py-2 text-xs font-black"
                disabled={live.operation !== "idle"}
                onClick={retryPoster}
                type="button"
              >
                {live.operation === "uploading" ? "Retrying..." : "Retry poster"}
              </button>
            )}
          </div>
        </div>
      )}

      {view === "discover" && (
        <DiscoverView
          dataStatus={catalogStatus || `JamBase catalog · ${live.discovery.catalogStats.historical} past / ${live.discovery.catalogStats.upcoming} upcoming`}
          discovery={live.discovery}
          followedArtistNames={(live.profile?.followedArtists ?? [])
            .map((artist) => artist?.name)
            .filter((name): name is string => Boolean(name))}
          homeCity={homeCity}
          locationStatus={locationStatus}
          mode={catalogMode}
          onMode={setCatalogMode}
          onOpenBackfill={() => setBackfillOpen(true)}
          onSyncJamBase={syncJamBase}
          onHomeCityChange={changeHomeCity}
          openArtist={openArtist}
          openShow={openShow}
          openVenue={openVenue}
          query={query}
          setQuery={setQuery}
          favoriteArtists={onboardingProfile.favoriteArtists}
        />
      )}

      {view === "show" && (
        <ShowView
          detail={live.showDetail}
          error={formError}
          logOpen={logOpen}
          moments={moments}
          posterIndex={posterIndex}
          onPosterIndex={setPosterIndex}
          onAddMoments={addMoments}
          openArtist={openArtist}
          openShow={openShow}
          openVenue={openVenue}
          onBack={() => navigate(cameFrom === "diary" ? "profile" : "discover")}
          operation={live.operation}
          rating={rating}
          review={review}
          caption={caption}
          selectedSong={selectedSong}
          selectedVibes={selectedVibes}
          currentUserId={live.user?._id}
          setAttendance={setAttendance}
          setCaption={setCaption}
          setLogOpen={setLogOpen}
          setRating={setRating}
          setReview={setReview}
          setSelectedSong={setSelectedSong}
          submitLog={submitLog}
          toggleVibe={toggleVibe}
          onToggleWatchlist={(showId) => live.toggleWatchlist("show", showId)}
        />
      )}

      {view === "artists" && (
        <ArtistsDirectoryView openArtist={openArtist} shows={shows} />
      )}

      {view === "venues" && (
        <VenuesDirectoryView openVenue={openVenue} shows={shows} />
      )}

      {view === "leaderboard" && (
        <ActivityView
          activityScope={activityScope}
          feed={live.activityFeed}
          leaderboard={live.leaderboard}
          matches={live.tasteMatches}
          onActivityScope={setActivityScope}
          onOpenMatch={(matchUserId) => {
            setSelectedMatchUserId(matchUserId);
            navigate("tasteMatch");
          }}
          onOpenShow={openShow}
          onScope={setLeaderScope}
          onToggleLike={(logId) => live.toggleReviewLike(logId as Id<"logs">)}
          onWatchlist={(showId) => live.toggleWatchlist("show", showId)}
          scope={leaderScope}
        />
      )}

      {view === "tasteMatch" && (
        <TasteMatchView
          detail={live.tasteMatchDetail}
          onBack={() => navigate("leaderboard")}
          onOpenShow={openShow}
          onWatchlist={(showId) => live.toggleWatchlist("show", showId)}
        />
      )}

      {view === "profile" && (
        <ProfileView
          userId={live.user!._id}
          filter={diaryFilter}
          memories={memories}
          onFilter={setDiaryFilter}
          openArtist={openArtist}
          openShow={openShow}
          openVenue={openVenue}
          onSetFavorites={(logIds) => live.setFavorites(logIds as Id<"logs">[])}
          onSignOut={signOut}
          profile={live.profile}
        />
      )}

      {view === "artist" && (
        <ArtistView
          detail={live.artistDetail}
          onBack={() => navigate("show")}
          onFollow={(artistId) => live.toggleArtistFollow(artistId as Id<"artists">)}
          openShow={openShow}
        />
      )}

      {view === "venue" && (
        <VenueView
          detail={live.venueDetail}
          onBack={() => navigate("show")}
          onFollow={(venueId) => live.toggleVenueFollow(venueId as Id<"venues">)}
          onToggleWatchlist={(venueId) => live.toggleWatchlist("venue", venueId)}
          openShow={openShow}
        />
      )}

      <TabBar
        cameFrom={cameFrom}
        catalogMode={catalogMode}
        hasSocialContent={hasSocialContent}
        onTab={handleTab}
        socialEnabled={SOCIAL_ENABLED}
        view={view}
      />

      {backfillOpen && live.user && (
        <BackfillFlow
          favoriteArtists={onboardingProfile.favoriteArtists}
          onClose={() => {
            setBackfillOpen(false);
            setCatalogMode("past");
            navigate("discover");
          }}
          onDone={(reclaimed) => {
            setBackfillOpen(false);
            if (reclaimed > 0) {
              setNotice(`${reclaimed} ${reclaimed === 1 ? "show" : "shows"} reclaimed from your photos.`);
            }
            handleTab({ view: "profile", catalogMode: "upcoming" }, "diary");
          }}
          shows={shows}
          userId={live.user._id}
        />
      )}
    </main>
  );
}
