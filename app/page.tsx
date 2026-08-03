"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  CircleUserRound,
  Compass,
  ExternalLink,
  Grid3X3,
  Library,
  ListFilter,
  MapPin,
  Music2,
  Search,
  Share2,
  Star,
  Ticket,
  Trophy,
  X,
} from "lucide-react";
import type { Id } from "../convex/_generated/dataModel";
import { Onboarding } from "./Onboarding";
import { vibes, type Show } from "./data";
import {
  describeSaveResult,
  filterMemories,
  resolveShowImage,
  toMemory,
  toShow,
  type LiveMemory,
} from "./liveData.js";
import type { OnboardingIntent, OnboardingProfile } from "./onboarding.d";
import type * as OnboardingApi from "./onboarding.d";
import { useShowtonic } from "./useShowtonic";

type View = "discover" | "show" | "diary" | "leaderboard" | "profile" | "artist" | "venue";
type Attendance = "interested" | "going" | "logged";
type DiaryFilter = "Artist" | "City" | "Genre" | "Calendar" | "Rating" | "Venue" | "Photo";
type LiveState = ReturnType<typeof useShowtonic>;
type ShowDetailPayload = NonNullable<LiveState["showDetail"]>;
type ArtistDetailPayload = NonNullable<LiveState["artistDetail"]>;
type VenueDetailPayload = NonNullable<LiveState["venueDetail"]>;
type OnboardingRuntime = Pick<
  typeof OnboardingApi,
  "findFirstPreferredShow" | "prioritizeShowsByArtists" | "readOnboardingProfile" | "writeOnboardingProfile"
>;

// Keep the Task 1 CommonJS runtime separate from its declarations on case-insensitive disks.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- See the filename-collision note above.
const { findFirstPreferredShow, prioritizeShowsByArtists, readOnboardingProfile, writeOnboardingProfile } = require("./onboarding.js") as OnboardingRuntime;

const tracksByArtist: Record<string, string[]> = {
  "Charli XCX": ["360", "Apple", "Von dutch"],
  "RÜFÜS DU SOL": ["Innerbloom", "Next to Me", "On My Knees"],
  Doechii: ["Nissan Altima", "Denial Is a River", "Alter Ego"],
  "The Strokes": ["Last Nite", "Someday", "Reptilia"],
  "Vampire Weekend": ["A-Punk", "Harmony Hall", "Capricorn"],
  MUNA: ["Silk Chiffon", "Number One Fan", "Anything But Me"],
  "Jamie xx": ["Loud Places", "Gosh", "All Under One Roof Raving"],
};

function adaptShow(value: object) {
  return toShow(value as Record<string, unknown>);
}

function tracksFor(name?: string) {
  return tracksByArtist[name ?? ""] ?? ["Festival favorite", "Live preview", "Set closer"];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export default function Home() {
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const [pendingOnboardingIntent, setPendingOnboardingIntent] = useState<OnboardingIntent | null>(null);
  const [view, setView] = useState<View>("discover");
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [diaryFilter, setDiaryFilter] = useState<DiaryFilter>("Photo");
  const [leaderScope, setLeaderScope] = useState<"city" | "artist" | "venue">("city");
  const [logOpen, setLogOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>(["transcendent"]);
  const [selectedSong, setSelectedSong] = useState("");
  const [selectedFile, setSelectedFile] = useState<File>();
  const [mediaPreview, setMediaPreview] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingMedia, setPendingMedia] = useState<{
    logId: Id<"logs">;
    showId: Id<"shows">;
    file: File;
    caption?: string;
  }>();

  const live = useShowtonic({
    handle: onboardingProfile?.completed ? onboardingProfile.handle : undefined,
    selectedShowId,
    selectedArtistId,
    selectedVenueId,
    query: deferredQuery,
    leaderboardScope: leaderScope,
  });

  const shows = useMemo(
    () => (live.discovery?.shows ?? []).map((show) => adaptShow(show)),
    [live.discovery],
  );
  const memories = useMemo(
    () => (live.diary?.logs ?? []).map((log) => toMemory(log as Record<string, unknown>)),
    [live.diary],
  );
  const filteredMemories = useMemo(
    () => filterMemories(memories, diaryFilter),
    [diaryFilter, memories],
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
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  useEffect(() => {
    if (pendingOnboardingIntent === "explore") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Explore completes directly on the Discover view.
      setView("discover");
      setPendingOnboardingIntent(null);
      return;
    }
    if (pendingOnboardingIntent !== "log" || !onboardingProfile?.completed || shows.length === 0) {
      return;
    }

    const firstShow = findFirstPreferredShow(shows, onboardingProfile.favoriteArtists);
    if (!firstShow) return;

    setSelectedShowId(firstShow.id);
    setSelectedSong(tracksFor(firstShow.artistNames?.[0])[0]);
    setLogOpen(true);
    setView("show");
    setPendingOnboardingIntent(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [onboardingProfile, pendingOnboardingIntent, shows]);

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function openShow(showId: string, openLogger = false) {
    const show = shows.find((item) => item.id === showId);
    setSelectedShowId(showId);
    setSelectedSong(tracksFor(show?.artistNames?.[0])[0]);
    setLogOpen(openLogger);
    navigate("show");
  }

  function openArtist(artistId: string) {
    setSelectedArtistId(artistId);
    navigate("artist");
  }

  function openVenue(venueId: string) {
    setSelectedVenueId(venueId);
    navigate("venue");
  }

  function chooseFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMediaPreview(URL.createObjectURL(file));
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
      const result = await live.saveLog({
        showId: selectedShowId as Id<"shows">,
        rating,
        vibes: selectedVibes,
        review,
        caption,
        song: selectedSong,
        file: selectedFile,
      });
      const saveResult = describeSaveResult({
        logId: result.logId,
        mediaError: result.mediaError,
      });
      setLogOpen(false);
      setReview("");
      setCaption("");
      setSelectedVibes(["transcendent"]);
      if (result.mediaError && selectedFile) {
        setPendingMedia({
          logId: result.logId,
          showId: selectedShowId as Id<"shows">,
          file: selectedFile,
          caption: caption.trim() || undefined,
        });
        setNotice(`Show saved. Poster needs a retry: ${saveResult.message}`);
      } else {
        setPendingMedia(undefined);
        setSelectedFile(undefined);
        setMediaPreview("");
        setNotice(saveResult.message);
      }
      navigate("diary");
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
      setSelectedFile(undefined);
      setMediaPreview("");
      setNotice("Poster attached to your saved show.");
    } catch (error) {
      setNotice(
        `Show is still saved. Poster retry failed: ${
          error instanceof Error ? error.message : "Upload failed"
        }`,
      );
    }
  }

  if (onboardingProfile === null) {
    return <StatusPanel title="Preparing your first set" detail="Setting up your local music diary..." loading />;
  }
  if (!onboardingProfile.completed) {
    return <Onboarding initialProfile={onboardingProfile} onComplete={completeOnboarding} />;
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

  return (
    <main className="min-h-screen bg-[#14181C] pb-24 text-[#F4F6F8] sm:pb-0">
      <Header handle={live.user?.handle ?? "tinsley"} navigate={navigate} view={view} />

      {notice && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 border border-[#20D6AA] bg-[#17352F] px-4 py-3 text-sm text-[#BDF8E9]">
            <span>{notice}</span>
            {pendingMedia && (
              <button
                className="shrink-0 border border-[#20D6AA] px-3 py-2 text-xs font-black"
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
          discovery={live.discovery}
          openShow={openShow}
          query={query}
          searchResults={live.searchResults.map((show) => adaptShow(show))}
          setQuery={setQuery}
          favoriteArtists={onboardingProfile.favoriteArtists}
        />
      )}

      {view === "show" && (
        <ShowView
          detail={live.showDetail}
          error={formError}
          logOpen={logOpen}
          mediaPreview={mediaPreview}
          openArtist={openArtist}
          openShow={openShow}
          openVenue={openVenue}
          operation={live.operation}
          rating={rating}
          review={review}
          caption={caption}
          selectedSong={selectedSong}
          selectedVibes={selectedVibes}
          setAttendance={setAttendance}
          setCaption={setCaption}
          setLogOpen={setLogOpen}
          setRating={setRating}
          setReview={setReview}
          setSelectedSong={setSelectedSong}
          submitLog={submitLog}
          toggleVibe={toggleVibe}
          chooseFile={chooseFile}
        />
      )}

      {view === "diary" && (
        <DiaryView
          filter={diaryFilter}
          memories={filteredMemories}
          onFilter={setDiaryFilter}
          openShow={openShow}
          stats={live.diary?.stats}
        />
      )}

      {view === "leaderboard" && (
        <LeaderboardView
          leaderboard={live.leaderboard}
          matches={live.tasteMatches}
          onScope={setLeaderScope}
          scope={leaderScope}
        />
      )}

      {view === "profile" && (
        <ProfileView memories={memories} openShow={openShow} profile={live.profile} />
      )}

      {view === "artist" && (
        <ArtistView detail={live.artistDetail} onBack={() => navigate("show")} openShow={openShow} />
      )}

      {view === "venue" && (
        <VenueView detail={live.venueDetail} onBack={() => navigate("show")} openShow={openShow} />
      )}

      <BottomNav navigate={navigate} view={view} />
    </main>
  );
}

function Header({ view, navigate, handle }: { view: View; navigate: (view: View) => void; handle: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#14181C]/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <button className="text-left" onClick={() => navigate("discover")} type="button">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#20D6AA]">Live music diary</p>
          <h1 className="text-2xl font-black tracking-tight">Showtonic</h1>
        </button>
        <div className="hidden items-center gap-1 sm:flex">
          {[
            ["discover", "Discover"],
            ["diary", "Diary"],
            ["leaderboard", "Leaderboard"],
          ].map(([target, label]) => (
            <button
              className={`px-4 py-2 text-xs font-bold ${view === target ? "bg-[#20D6AA] text-black" : "text-[#9AA8B4]"}`}
              key={target}
              onClick={() => navigate(target as View)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          aria-label={`Open @${handle} profile`}
          className="flex items-center gap-2 border border-[#42505D] px-3 py-2 text-xs"
          onClick={() => navigate("profile")}
          type="button"
        >
          <CircleUserRound className="h-4 w-4 text-[#47B7EF]" /> @{handle}
        </button>
      </nav>
    </header>
  );
}

function DiscoverView({
  discovery,
  favoriteArtists,
  query,
  setQuery,
  searchResults,
  openShow,
}: {
  discovery: NonNullable<LiveState["discovery"]>;
  favoriteArtists: string[];
  query: string;
  setQuery: (value: string) => void;
  searchResults: Show[];
  openShow: (id: string, logger?: boolean) => void;
}) {
  const hero = adaptShow(discovery.shelves.popularThisWeek[0] ?? discovery.shows[0]);
  const shelves = [
    ["Popular this week", "Verified ratings and logs", discovery.shelves.popularThisWeek],
    ["Trending among showgoers", "Going and logged activity", discovery.shelves.trendingAmongFriends],
    [
      "Taste-led picks",
      favoriteArtists.length ? "Based on your setup picks" : "Top-rated artists in the seeded lineup",
      prioritizeShowsByArtists(discovery.shelves.followedArtists, favoriteArtists),
    ],
    ["Nearby", "San Francisco venues", discovery.shelves.nearby],
    ["This weekend", "Outside Lands lineup", discovery.shelves.thisWeekend],
  ] as const;

  return (
    <div>
      <section className="relative min-h-[62vh] overflow-hidden">
        <img alt={hero.title} className="absolute inset-0 h-full w-full object-cover" src={hero.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#14181C]/10 via-[#14181C]/55 to-[#14181C]" />
        <div className="relative mx-auto flex min-h-[62vh] max-w-6xl flex-col justify-end px-4 pb-10 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#20D6AA]">Outside Lands 2026</p>
          <h2 className="mt-3 max-w-3xl text-5xl font-black leading-[0.95] sm:text-7xl">Your shows become your story.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#D2D9DF]">Discover the set, log the feeling, save one poster moment, and find the people whose taste overlaps yours.</p>
          <button className="mt-7 w-fit bg-[#20D6AA] px-5 py-3 text-sm font-black text-black" onClick={() => openShow(hero.id)} type="button">Open tonight&apos;s pick</button>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <label className="flex items-center gap-3 border border-[#42505D] bg-[#202830] px-4 py-3">
          <Search className="h-5 w-5 text-[#47B7EF]" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#748391]" onChange={(event) => setQuery(event.target.value)} placeholder="Search artists, shows, venues, or city" value={query} />
          {query && <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><X className="h-4 w-4" /></button>}
        </label>

        {query.trim() ? (
          <ShowRail eyebrow={`${searchResults.length} live matches`} openShow={openShow} shows={searchResults} title="Search results" />
        ) : (
          shelves.map(([title, eyebrow, items]) => (
            <ShowRail eyebrow={eyebrow} key={title} openShow={openShow} shows={items.map((item) => adaptShow(item))} title={title} />
          ))
        )}
      </div>
    </div>
  );
}

function ShowView({
  detail,
  error,
  logOpen,
  setLogOpen,
  setAttendance,
  openArtist,
  openVenue,
  openShow,
  operation,
  rating,
  setRating,
  review,
  setReview,
  caption,
  setCaption,
  selectedVibes,
  toggleVibe,
  mediaPreview,
  chooseFile,
  selectedSong,
  setSelectedSong,
  submitLog,
}: {
  detail: LiveState["showDetail"];
  error: string;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  setAttendance: (status: Attendance) => Promise<void>;
  openArtist: (id: string) => void;
  openVenue: (id: string) => void;
  openShow: (id: string) => void;
  operation: LiveState["operation"];
  rating: number;
  setRating: (value: number) => void;
  review: string;
  setReview: (value: string) => void;
  caption: string;
  setCaption: (value: string) => void;
  selectedVibes: string[];
  toggleVibe: (vibe: string) => void;
  mediaPreview: string;
  chooseFile: (files: FileList | null) => void;
  selectedSong: string;
  setSelectedSong: (song: string) => void;
  submitLog: () => Promise<void>;
}) {
  if (detail === undefined) return <StatusPanel title="Loading show" detail="Pulling the live details from Convex..." loading />;
  if (!detail) return <StatusPanel title="Show not found" detail="Choose another show from Discover." />;

  const show = adaptShow({
    ...detail.show,
    id: detail.show._id,
    rating: detail.rating,
    ratingCount: detail.ratingCount,
    attendanceStatus: detail.attendanceStatus,
    interestedCount: detail.attendanceCounts.interested,
    goingCount: detail.attendanceCounts.going,
    loggedCount: detail.attendanceCounts.logged,
  });
  const artist = detail.artists[0];
  const tracks = tracksFor(artist?.name);

  return (
    <div>
      <section className="relative min-h-[54vh] overflow-hidden">
        <img alt={show.title} className="absolute inset-0 h-full w-full object-cover" src={show.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#14181C]/65 to-[#14181C]" />
        <div className="relative mx-auto flex min-h-[54vh] max-w-6xl flex-col justify-end px-4 pb-8 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#47B7EF]">{show.day} · {show.time} · {show.stage}</p>
          <h1 className="mt-3 max-w-4xl text-5xl font-black leading-none sm:text-7xl">{show.title}</h1>
          <button className="mt-4 flex w-fit items-center gap-2 text-sm text-[#B8C2CC]" onClick={() => show.venueId && openVenue(show.venueId)} type="button"><MapPin className="h-4 w-4" /> {show.venueName}, {show.city}</button>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <section className="grid grid-cols-3 border border-[#42505D] bg-[#202830] p-5 text-center">
            <Stat label="rating" value={detail.ratingCount ? detail.rating.toFixed(1) : "New"} />
            <Stat label="verified logs" value={String(detail.ratingCount)} />
            <Stat label="going" value={String(detail.attendanceCounts.going)} />
          </section>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {(["interested", "going", "logged"] as Attendance[]).map((status) => (
              <button className={`border px-3 py-3 text-xs font-black capitalize ${detail.attendanceStatus === status ? "border-[#20D6AA] bg-[#20D6AA] text-black" : "border-[#42505D] text-[#B8C2CC]"}`} disabled={operation !== "idle"} key={status} onClick={() => status === "logged" ? setLogOpen(true) : setAttendance(status)} type="button">{status}</button>
            ))}
          </div>
          {error && <p className="mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}

          <section className="mt-9">
            <SectionTitle eyebrow="Verified attendees only" title="Community notes" />
            <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
              {detail.logs.length ? detail.logs.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="Be the first person to log this show." />}
            </div>
          </section>

          <section className="mt-9">
            <SectionTitle eyebrow="Convex Storage" title="Poster moments" />
            {detail.media.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{detail.media.map((item) => item.url ? <img alt={item.caption ?? show.title} className="aspect-square w-full object-cover" key={item._id} src={item.url} /> : null)}</div> : <EmptyLine text="No uploaded posters yet." />}
          </section>

          <section className="mt-9">
            <ShowRail eyebrow="More from the seeded lineup" openShow={openShow} shows={detail.recommendedShows.map((item) => adaptShow(item))} title="What to see next" />
          </section>
        </div>

        <aside className="space-y-5">
          {artist && (
            <button className="w-full border border-[#42505D] bg-[#202830] p-5 text-left" onClick={() => openArtist(artist._id)} type="button">
              <p className="text-xs font-black uppercase text-[#20D6AA]">Artist</p>
              <h2 className="mt-2 text-3xl font-black">{artist.name}</h2>
              <p className="mt-2 text-sm text-[#9AA8B4]">{artist.hometown} · {artist.genres.join(" · ")}</p>
              <p className="mt-4 text-sm leading-6 text-[#B8C2CC]">{artist.bio}</p>
            </button>
          )}
          <a className="flex items-center justify-between border border-[#42505D] p-4 text-sm" href={show.jambaseUrl} rel="noreferrer" target="_blank">JamBase event data <ExternalLink className="h-4 w-4" /></a>
          {show.ticketUrl && <a className="flex items-center justify-between bg-[#47B7EF] p-4 text-sm font-black text-black" href={show.ticketUrl} rel="noreferrer" target="_blank">Tickets <Ticket className="h-4 w-4" /></a>}
          <button className="w-full bg-[#20D6AA] px-5 py-4 text-sm font-black text-black" onClick={() => setLogOpen(true)} type="button">Log this show</button>
        </aside>
      </div>

      {logOpen && (
        <LogSheet
          caption={caption}
          chooseFile={chooseFile}
          error={error}
          mediaPreview={mediaPreview}
          onClose={() => setLogOpen(false)}
          operation={operation}
          rating={rating}
          review={review}
          selectedSong={selectedSong || tracks[0]}
          selectedVibes={selectedVibes}
          setCaption={setCaption}
          setRating={setRating}
          setReview={setReview}
          setSelectedSong={setSelectedSong}
          show={show}
          submit={submitLog}
          toggleVibe={toggleVibe}
          tracks={tracks}
        />
      )}
    </div>
  );
}

function LogSheet({ show, rating, setRating, selectedVibes, toggleVibe, review, setReview, caption, setCaption, mediaPreview, chooseFile, tracks, selectedSong, setSelectedSong, submit, onClose, operation, error }: {
  show: Show; rating: number; setRating: (value: number) => void; selectedVibes: string[]; toggleVibe: (vibe: string) => void; review: string; setReview: (value: string) => void; caption: string; setCaption: (value: string) => void; mediaPreview: string; chooseFile: (files: FileList | null) => void; tracks: string[]; selectedSong: string; setSelectedSong: (song: string) => void; submit: () => Promise<void>; onClose: () => void; operation: LiveState["operation"]; error: string;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 sm:p-8">
      <section className="mx-auto max-w-2xl border border-[#42505D] bg-[#202830] shadow-2xl">
        <header className="flex items-start justify-between border-b border-white/10 p-5"><div><p className="text-xs font-black uppercase text-[#20D6AA]">Verified show log</p><h2 className="mt-1 text-2xl font-black">{show.title}</h2></div><button aria-label="Close logger" onClick={onClose} type="button"><X /></button></header>
        <div className="space-y-6 p-5">
          <div><p className="mb-2 text-xs font-black uppercase text-[#81909D]">Your rating</p><RatingStars interactive onChange={setRating} value={rating} /></div>
          <div><p className="mb-2 text-xs font-black uppercase text-[#81909D]">Show vibes</p><div className="flex flex-wrap gap-2">{vibes.map((vibe) => <button className={`border px-3 py-2 text-xs ${selectedVibes.includes(vibe) ? "border-[#20D6AA] bg-[#20D6AA] text-black" : "border-[#42505D] text-[#B8C2CC]"}`} key={vibe} onClick={() => toggleVibe(vibe)} type="button">{vibe}</button>)}</div></div>
          <label className="block"><span className="mb-2 block text-xs font-black uppercase text-[#81909D]">Review</span><textarea className="min-h-24 w-full border border-[#42505D] bg-[#14181C] p-3 text-sm outline-none focus:border-[#20D6AA]" onChange={(event) => setReview(event.target.value)} placeholder={show.memoryPrompt} value={review} /></label>
          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#748391] bg-[#14181C]">{mediaPreview ? <img alt="Selected poster" className="h-full w-full object-cover" src={mediaPreview} /> : <span className="flex flex-col items-center gap-2 text-xs text-[#9AA8B4]"><Camera /> One optional poster</span>}<input accept="image/*,video/*" className="sr-only" onChange={(event) => chooseFile(event.target.files)} type="file" /></label>
            <div className="space-y-3"><input className="w-full border border-[#42505D] bg-[#14181C] p-3 text-sm outline-none" onChange={(event) => setCaption(event.target.value)} placeholder="One-line caption" value={caption} />{tracks.map((track) => <button className={`flex w-full items-center gap-2 border p-2 text-left text-sm ${selectedSong === track ? "border-[#20D6AA] text-[#20D6AA]" : "border-[#42505D]"}`} key={track} onClick={() => setSelectedSong(track)} type="button"><Music2 className="h-4 w-4" /> {track}{selectedSong === track && <Check className="ml-auto h-4 w-4" />}</button>)}</div>
          </div>
          {error && <p className="border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
          <button className="w-full bg-[#20D6AA] px-5 py-4 text-sm font-black text-black disabled:opacity-50" disabled={operation !== "idle"} onClick={submit} type="button">{operation === "saving" ? "Saving log..." : operation === "uploading" ? "Uploading poster..." : "Save to diary"}</button>
        </div>
      </section>
    </div>
  );
}

function DiaryView({ memories, filter, onFilter, openShow, stats }: { memories: LiveMemory[]; filter: DiaryFilter; onFilter: (filter: DiaryFilter) => void; openShow: (id: string) => void; stats?: { shows: number; artists: number; venues: number; cities: number; averageRating: number } }) {
  const filters: DiaryFilter[] = ["Artist", "City", "Genre", "Calendar", "Rating", "Venue", "Photo"];
  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><PageTitle eyebrow="Your live music life" title="Diary" /><section className="mt-6 grid grid-cols-3 border border-[#42505D] bg-[#202830] p-5 text-center"><Stat label="shows" value={String(stats?.shows ?? 0)} /><Stat label="artists" value={String(stats?.artists ?? 0)} /><Stat label="average" value={(stats?.averageRating ?? 0).toFixed(1)} /></section><section className="mt-8 border-t border-white/10 pt-6"><div className="flex items-center gap-2"><ListFilter className="h-5 w-5 text-[#47B7EF]" /><h2 className="text-xl font-black">See diary by</h2></div><div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">{filters.map((item) => <button className={`shrink-0 border px-4 py-2 text-xs font-bold ${filter === item ? "border-[#47B7EF] bg-[#47B7EF] text-black" : "border-[#42505D] text-[#B8C2CC]"}`} key={item} onClick={() => onFilter(item)} type="button">{item}</button>)}</div></section>{filter === "Calendar" ? <DiaryCalendar memories={memories} /> : memories.length ? <section className="mt-6"><div className="flex items-center justify-between"><div><p className="text-xs uppercase text-[#81909D]">Persisted by {filter.toLowerCase()}</p><h2 className="mt-1 text-2xl font-black">Your moments</h2></div><Grid3X3 className="text-[#748391]" /></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{memories.map((memory) => <button className="group relative aspect-square overflow-hidden bg-[#202830]" key={memory.id} onClick={() => openShow(memory.showId)} type="button"><img alt={memory.caption} className="h-full w-full object-cover transition group-hover:scale-105" src={memory.photo} /><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3 text-left"><b className="block truncate text-sm">{memory.artistNames.join(" + ")}</b><small className="text-[#20D6AA]">{memory.rating} · {formatDate(memory.date)}</small></span></button>)}</div></section> : <EmptyLine text="Log your first show and it will appear here." />}</div>;
}

function DiaryCalendar({ memories }: { memories: LiveMemory[] }) {
  const activeDays = new Set(memories.map((memory) => Number(memory.date.slice(-2))));
  return <section className="mt-6 border border-[#42505D] bg-[#202830] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">August 2026</h2><CalendarDays className="text-[#47B7EF]" /></div><div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <b className="py-2 text-[#81909D]" key={`${day}-${index}`}>{day}</b>)}{Array.from({ length: 31 }).map((_, index) => { const day = index + 1; return <span className={`flex aspect-square items-center justify-center ${activeDays.has(day) ? "rounded-full bg-[#20D6AA] font-black text-black" : "text-[#D2D9DF]"}`} key={day}>{day}</span>; })}</div></section>;
}

function LeaderboardView({ leaderboard, matches, scope, onScope }: { leaderboard: LiveState["leaderboard"]; matches: LiveState["tasteMatches"]; scope: "city" | "artist" | "venue"; onScope: (scope: "city" | "artist" | "venue") => void }) {
  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6"><PageTitle eyebrow="Verified activity" title="Member leaderboard" /><div className="mt-6 grid grid-cols-3 border border-[#42505D] p-1">{(["city", "artist", "venue"] as const).map((item) => <button className={`px-3 py-2 text-xs font-bold capitalize ${scope === item ? "bg-[#47B7EF] text-black" : "text-[#9AA8B4]"}`} key={item} onClick={() => onScope(item)} type="button">{item}</button>)}</div><section className="mt-8"><SectionTitle eyebrow={leaderboard?.label ?? "Loading"} title="Most active" /><div className="mt-4 divide-y divide-white/10">{leaderboard?.rows.map((row, index) => <div className="grid grid-cols-[32px_44px_1fr_auto] items-center gap-3 py-4" key={row.userId}><strong className="text-xl text-[#748391]">{index + 1}</strong><Avatar color={row.avatarColor} name={row.handle} /><div><b>@{row.handle}</b><p className="text-xs text-[#81909D]">{row.note}</p></div><b className="text-sm text-[#20D6AA]">{row.value}</b></div>)}</div></section><section className="mt-9 border-t border-white/10 pt-6"><SectionTitle eyebrow="Jaccard taste score" title="Most similar to you" />{matches.length ? <div className="mt-4 space-y-3">{matches.map((match) => <div className="flex items-center gap-3 border border-[#42505D] bg-[#202830] p-4" key={match.userId}><Avatar color={match.avatarColor} name={match.handle} /><div className="flex-1"><b>@{match.handle}</b><p className="mt-1 text-xs text-[#9AA8B4]">{match.sharedArtistNames.length ? `Both saw ${match.sharedArtistNames.join(", ")}` : `${match.sharedShowCount} shared shows`}</p></div><strong className="text-2xl text-[#20D6AA]">{Math.round(match.score * 100)}%</strong></div>)}</div> : <EmptyLine text="Log another show to unlock stronger taste matches." />}</section></div>;
}

function ProfileView({ profile, memories, openShow }: { profile: LiveState["profile"]; memories: LiveMemory[]; openShow: (id: string) => void }) {
  if (profile === undefined) return <StatusPanel title="Loading profile" detail="Calculating your live music stats..." loading />;
  if (!profile) return <StatusPanel title="Profile unavailable" detail="Reload to retry your local identity." />;
  return <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6"><div className="flex items-center justify-between"><PageTitle eyebrow={`@${profile.user.handle}`} title="Your show identity" /><button aria-label="Share profile" onClick={() => navigator.share?.({ title: "My Showtonic diary", text: `${profile.stats.shows} shows and counting.` })} type="button"><Share2 /></button></div><section className="mt-6 border border-[#42505D] bg-[#263139] p-6"><p className="text-xs font-black uppercase text-[#47B7EF]">All seeded activity</p><h2 className="mt-2 text-3xl font-black">Your live music archive</h2><div className="mt-7 grid grid-cols-3 text-center"><Stat label="shows" value={String(profile.stats.shows)} /><Stat label="artists" value={String(profile.stats.artists)} /><Stat label="venues" value={String(profile.stats.venues)} /></div></section><section className="mt-8"><SectionTitle eyebrow="Highest verified ratings" title="Favorite shows" />{profile.favoriteShows.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{profile.favoriteShows.map((log) => { const memory = toMemory(log as Record<string, unknown>); return <button className="aspect-[2/3] overflow-hidden border border-[#42505D]" key={log._id} onClick={() => openShow(log.showId)} type="button"><img alt={log.showTitle} className="h-full w-full object-cover" src={memory.photo} /></button>; })}</div> : <EmptyLine text="Your top shows will appear after you log them." />}</section><section className="mt-8 border-t border-white/10 pt-6"><SectionTitle eyebrow="One poster per persisted show" title="Live grid" />{memories.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{memories.map((memory) => <button className="aspect-square overflow-hidden" key={memory.id} onClick={() => openShow(memory.showId)} type="button"><img alt={memory.caption} className="h-full w-full object-cover" src={memory.photo} /></button>)}</div> : <EmptyLine text="No poster moments yet." />}</section></div>;
}

function ArtistView({ detail, onBack, openShow }: { detail: LiveState["artistDetail"]; onBack: () => void; openShow: (id: string) => void }) {
  if (detail === undefined) return <StatusPanel title="Loading artist" detail="Reading the seeded JamBase profile..." loading />;
  if (!detail) return <StatusPanel title="Artist unavailable" detail="Return to the show and choose another artist." />;
  const artist = detail.artist;
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><BackButton onClick={onBack} /><section className="mt-6 grid gap-5 sm:grid-cols-[180px_1fr]"><img alt={artist.name} className="aspect-square w-full object-cover" src={resolveShowImage(artist.image, [artist.name])} /><div><p className="text-xs font-black uppercase text-[#20D6AA]">Artist · {detail.ratingCount} verified ratings</p><h1 className="mt-2 text-4xl font-black">{artist.name}</h1><p className="mt-2 text-sm text-[#9AA8B4]">{artist.hometown} · {artist.genres.join(" · ")}</p><p className="mt-4 max-w-2xl text-sm leading-6 text-[#B8C2CC]">{artist.bio}</p>{artist.jambaseUrl && <a className="mt-5 inline-flex items-center gap-2 text-sm text-[#47B7EF]" href={artist.jambaseUrl} rel="noreferrer" target="_blank">JamBase artist profile <ExternalLink className="h-4 w-4" /></a>}</div></section><ShowRail eyebrow={`${detail.rating.toFixed(1)} average rating`} openShow={openShow} shows={detail.shows.map((show) => adaptShow(show))} title="Shows" /><section className="mt-9"><SectionTitle eyebrow="Verified show logs" title="Reviews" /><div className="mt-4 divide-y divide-white/10">{detail.reviews.length ? detail.reviews.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="No artist reviews yet." />}</div></section></div>;
}

function VenueView({ detail, onBack, openShow }: { detail: LiveState["venueDetail"]; onBack: () => void; openShow: (id: string) => void }) {
  if (detail === undefined) return <StatusPanel title="Loading venue" detail="Reading the venue archive..." loading />;
  if (!detail) return <StatusPanel title="Venue unavailable" detail="Return to the show and choose another venue." />;
  const venue = detail.venue;
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><BackButton onClick={onBack} /><section className="mt-6"><img alt={venue.name} className="aspect-[16/7] w-full object-cover" src={resolveShowImage(venue.image, [venue.name])} /><div className="mt-5 flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-[#47B7EF]">Venue</p><h1 className="mt-2 text-4xl font-black">{venue.name}</h1><p className="mt-2 flex items-center gap-2 text-sm text-[#9AA8B4]"><MapPin className="h-4 w-4" /> {venue.city}, {venue.region}</p></div><div className="text-right"><strong className="text-3xl text-[#20D6AA]">{detail.ratingCount ? detail.rating.toFixed(1) : "New"}</strong><p className="text-[10px] text-[#81909D]">{detail.ratingCount} ratings</p></div></div><p className="mt-5 max-w-3xl text-sm leading-6 text-[#B8C2CC]">{venue.description}</p><div className="mt-5 flex gap-3">{venue.website && <a className="flex items-center gap-2 border border-[#42505D] px-4 py-3 text-sm" href={venue.website} rel="noreferrer" target="_blank">Website <ExternalLink className="h-4 w-4" /></a>}{venue.jambaseUrl && <a className="flex items-center gap-2 border border-[#42505D] px-4 py-3 text-sm" href={venue.jambaseUrl} rel="noreferrer" target="_blank">JamBase <ExternalLink className="h-4 w-4" /></a>}</div></section><ShowRail eyebrow={`${detail.shows.length} seeded events`} openShow={openShow} shows={detail.shows.map((show) => adaptShow(show))} title="Shows at this venue" /></div>;
}

function ShowRail({ title, eyebrow, shows, openShow }: { title: string; eyebrow: string; shows: Show[]; openShow: (id: string) => void }) {
  return <section className="mt-10"><SectionTitle eyebrow={eyebrow} title={title} />{shows.length ? <div className="hide-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">{shows.map((show) => <ShowCard key={show.id} openShow={openShow} show={show} />)}</div> : <EmptyLine text="No shows in this shelf yet." />}</section>;
}

function ShowCard({ show, openShow }: { show: Show; openShow: (id: string) => void }) {
  return <button className="w-44 shrink-0 overflow-hidden border border-[#34414D] bg-[#202830] text-left sm:w-52" onClick={() => openShow(show.id)} type="button"><div className="relative aspect-[2/3]"><img alt={show.title} className="h-full w-full object-cover" src={show.image} /><span className="absolute right-2 top-2 bg-[#14181C]/90 px-2 py-1 text-xs font-black text-[#20D6AA]">{show.ratingCount ? `${show.rating?.toFixed(1)} ★` : "NEW"}</span></div><div className="p-3"><b className="block truncate">{show.artistNames?.join(" + ") || show.title}</b><p className="mt-1 truncate text-xs text-[#9AA8B4]">{formatDate(show.date)} · {show.venueName}</p><p className="mt-2 text-[10px] font-black uppercase text-[#47B7EF]">{show.loggedCount ?? 0} logged · {show.goingCount ?? 0} going</p></div></button>;
}

function ReviewRow({ log }: { log: ShowDetailPayload["logs"][number] | ArtistDetailPayload["reviews"][number] | VenueDetailPayload["reviews"][number] }) {
  return <div className="flex gap-3 py-4"><Avatar color={log.user?.avatarColor} name={log.user?.handle ?? "showgoer"} /><div className="flex-1"><div className="flex items-center justify-between"><b className="text-sm">@{log.user?.handle ?? "showgoer"}</b><span className="flex items-center gap-1 text-xs text-[#20D6AA]"><Star className="h-3 w-3 fill-current" /> {log.rating}</span></div><p className="mt-2 text-sm text-[#B8C2CC]">{log.note || "Verified attendance"}</p>{log.vibes.length > 0 && <p className="mt-2 text-[10px] uppercase tracking-wide text-[#81909D]">{log.vibes.join(" · ")}</p>}</div></div>;
}

function RatingStars({ value, interactive = false, onChange }: { value: number; interactive?: boolean; onChange?: (value: number) => void }) {
  return <div aria-label={`${value} out of 5 stars`} className="flex gap-1">{[1, 2, 3, 4, 5].map((star) => <button aria-label={`${star} stars`} className={interactive ? "cursor-pointer" : "cursor-default"} disabled={!interactive} key={star} onClick={() => onChange?.(star)} type="button"><Star className={`h-7 w-7 ${value >= star ? "fill-[#20D6AA] text-[#20D6AA]" : "text-[#596875]"}`} /></button>)}</div>;
}

function BottomNav({ view, navigate }: { view: View; navigate: (view: View) => void }) {
  const items: [View, string, ReactNode][] = [["discover", "Discover", <Compass key="discover" />], ["diary", "Diary", <Library key="diary" />], ["leaderboard", "Leaders", <Trophy key="leaderboard" />], ["profile", "Profile", <CircleUserRound key="profile" />]];
  return <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/10 bg-[#14181C]/95 p-2 backdrop-blur sm:hidden">{items.map(([target, label, icon]) => <button className={`flex flex-col items-center gap-1 py-1 text-[10px] ${view === target ? "text-[#20D6AA]" : "text-[#81909D]"}`} key={target} onClick={() => navigate(target)} type="button"><span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>{label}</button>)}</nav>;
}

function StatusPanel({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#14181C] px-6 text-[#F4F6F8]"><section className="max-w-xl border border-[#42505D] bg-[#202830] p-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#20D6AA]">{loading ? "Live sync" : "Showtonic"}</p><h1 className="mt-3 text-3xl font-black">{title}</h1><p className="mt-4 leading-7 text-[#B8C2CC]">{detail}</p>{loading && <div className="mt-6 h-1 overflow-hidden bg-[#34414D]"><div className="h-full w-1/2 animate-pulse bg-[#20D6AA]" /></div>}</section></main>;
}

function SectionTitle({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#81909D]">{eyebrow}</p><h2 className="mt-1 text-2xl font-black">{title}</h2></div>;
}

function PageTitle({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div><p className="text-sm text-[#9AA8B4]">{eyebrow}</p><h1 className="mt-1 text-3xl font-black">{title}</h1></div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-white/10 px-2 last:border-r-0"><strong className="block text-2xl font-black sm:text-3xl">{value}</strong><span className="mt-1 block text-[10px] uppercase text-[#81909D]">{label}</span></div>;
}

function Avatar({ name, color }: { name: string; color?: string }) {
  return <span aria-label={name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#202830] text-xs font-black text-black" style={{ backgroundColor: color ?? "#47B7EF" }}>{name.slice(0, 1).toUpperCase()}</span>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button className="flex items-center gap-2 text-sm text-[#9AA8B4]" onClick={onClick} type="button"><ArrowLeft className="h-4 w-4" /> Back to show</button>;
}

function EmptyLine({ text }: { text: string }) {
  return <p className="mt-4 border border-dashed border-[#42505D] p-5 text-sm text-[#9AA8B4]">{text}</p>;
}
