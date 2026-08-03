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
  Heart,
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
import { vibes, type Show } from "./data";
import {
  describeSaveResult,
  filterMemories,
  resolveShowImage,
  toMemory,
  toShow,
  type LiveMemory,
} from "./liveData.js";
import { useShowtonic } from "./useShowtonic";

type View = "discover" | "show" | "diary" | "leaderboard" | "profile" | "artist" | "venue";
type Attendance = "interested" | "going" | "logged";
type CatalogMode = "upcoming" | "past";
type DiaryFilter = "Artist" | "City" | "Genre" | "Calendar" | "Rating" | "Venue" | "Photo";
type LiveState = ReturnType<typeof useShowtonic>;
type ShowDetailPayload = NonNullable<LiveState["showDetail"]>;
type ArtistDetailPayload = NonNullable<LiveState["artistDetail"]>;
type VenueDetailPayload = NonNullable<LiveState["venueDetail"]>;

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

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function collapseFestivalShows(values: Show[]) {
  const parents = new Map<string, Show>();
  for (const show of values) {
    if (!show.festivalId || (show.artistNames?.length ?? 0) < 2) continue;
    const current = parents.get(show.festivalId);
    if (!current || (show.artistNames?.length ?? 0) > (current.artistNames?.length ?? 0)) {
      parents.set(show.festivalId, show);
    }
  }
  const collapsed = new Map<string, Show>();
  for (const show of values) {
    const canonical = show.festivalId ? parents.get(show.festivalId) ?? show : show;
    collapsed.set(canonical.id, canonical);
  }
  return [...collapsed.values()];
}

const cityCoordinates: Record<string, [number, number]> = {
  "San Francisco": [37.7749, -122.4194],
  Oakland: [37.8044, -122.2712],
  "San Jose": [37.3382, -121.8863],
  "Los Angeles": [34.0522, -118.2437],
  "New York": [40.7128, -74.006],
};

function nearestHomeCity(latitude: number, longitude: number, available: string[]) {
  const candidates = available.filter((city) => cityCoordinates[city]);
  return (candidates.length ? candidates : ["San Francisco"]).reduce((closest, city) => {
    const [lat, lng] = cityCoordinates[city];
    const [closestLat, closestLng] = cityCoordinates[closest];
    const distance = (lat - latitude) ** 2 + (lng - longitude) ** 2;
    const closestDistance = (closestLat - latitude) ** 2 + (closestLng - longitude) ** 2;
    return distance < closestDistance ? city : closest;
  });
}

export default function Home() {
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
  const [catalogStatus, setCatalogStatus] = useState("");
  const [homeCity, setHomeCity] = useState("San Francisco");
  const [locationStatus, setLocationStatus] = useState("Using your saved home base");
  const [pendingMedia, setPendingMedia] = useState<{
    logId: Id<"logs">;
    showId: Id<"shows">;
    file: File;
    caption?: string;
  }>();

  const live = useShowtonic({
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
    const saved = window.localStorage.getItem("showtonic.homeCity");
    if (saved) {
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
        const available = [...new Set(shows.map((show) => show.city).filter(Boolean))] as string[];
        const city = nearestHomeCity(coords.latitude, coords.longitude, available);
        setHomeCity(city);
        window.localStorage.setItem("showtonic.homeCity", city);
        setLocationStatus("Home base set from this device");
      },
      () => setLocationStatus("Location not shared · defaulting to San Francisco"),
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 8_000 },
    );
  }, [shows]);

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openShow(showId: string, openLogger = false) {
    const show = shows.find((item) => item.id === showId);
    setSelectedShowId(showId);
    setSelectedSong(tracksFor(show?.artistNames?.[0])[0]);
    setLogOpen(openLogger && Boolean(show && show.date < todayIso()));
    navigate("show");
  }

  function changeHomeCity(city: string) {
    setHomeCity(city);
    window.localStorage.setItem("showtonic.homeCity", city);
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

  async function syncJamBase() {
    setCatalogStatus("Syncing past year + upcoming...");
    try {
      const result = await live.syncCatalog();
      setCatalogStatus(
        `JamBase synced · ${result.historical.fetched} past / ${result.upcoming.fetched} upcoming`,
      );
    } catch (error) {
      setCatalogStatus(error instanceof Error ? error.message : "JamBase sync failed");
    }
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
          dataStatus={catalogStatus || `JamBase catalog · ${live.discovery.catalogStats.historical} past / ${live.discovery.catalogStats.upcoming} upcoming`}
          discovery={live.discovery}
          homeCity={homeCity}
          locationStatus={locationStatus}
          onSyncJamBase={syncJamBase}
          onHomeCityChange={changeHomeCity}
          openShow={openShow}
          query={query}
          setQuery={setQuery}
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
          openShow={openShow}
        />
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
  dataStatus,
  discovery,
  homeCity,
  locationStatus,
  onHomeCityChange,
  onSyncJamBase,
  query,
  setQuery,
  openShow,
}: {
  dataStatus: string;
  discovery: NonNullable<LiveState["discovery"]>;
  homeCity: string;
  locationStatus: string;
  onHomeCityChange: (city: string) => void;
  onSyncJamBase: () => Promise<void>;
  query: string;
  setQuery: (value: string) => void;
  openShow: (id: string, logger?: boolean) => void;
}) {
  const [mode, setMode] = useState<CatalogMode>("upcoming");
  const [artistFilter, setArtistFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const allShows = collapseFestivalShows(discovery.shows.map((show) => adaptShow(show)));
  const locations = [...new Set(allShows.map((show) => show.city).filter(Boolean))].sort() as string[];
  const venues = [...new Set(allShows.map((show) => show.venueName).filter(Boolean))].sort() as string[];
  const today = todayIso();
  const needle = query.trim().toLocaleLowerCase();
  const filtered = allShows
    .filter((show) => (mode === "upcoming" ? show.date >= today : show.date < today))
    .filter((show) => !homeCity || show.city === homeCity)
    .filter((show) => !artistFilter || show.artistNames?.some((artist) => artist.toLocaleLowerCase().includes(artistFilter.toLocaleLowerCase())))
    .filter((show) => !venueFilter || show.venueName === venueFilter)
    .filter((show) => !dateFrom || show.date >= dateFrom)
    .filter((show) => !dateTo || show.date <= dateTo)
    .filter((show) => {
      if (!needle) return true;
      return [show.title, show.venueName, show.city, ...(show.artistNames ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(needle));
    })
    .sort((left, right) =>
      mode === "upcoming" ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date),
    );
  const festival = filtered.find((show) => /outside lands/i.test(show.title) && (show.artistNames?.length ?? 0) > 1)
    ?? filtered.find((show) => show.festivalId && (show.artistNames?.length ?? 0) > 1);
  const hero = festival ?? filtered[0] ?? allShows.find((show) => show.date >= today) ?? allShows[0];
  const hasStructuredFilter = Boolean(query.trim() || artistFilter || venueFilter || dateFrom || dateTo);
  const upcomingShelves = [
    ["Popular this week", "What showgoers are saving now", discovery.shelves.popularThisWeek],
    ["Trending among friends", "Friends interested and going", discovery.shelves.trendingAmongFriends],
    ["Artists for your taste", "Based on artists you follow and rate", discovery.shelves.followedArtists],
    ["This weekend", homeCity, discovery.shelves.thisWeekend],
  ] as const;

  function filteredShelf(items: readonly object[]) {
    const ids = new Set(items.map((item) => adaptShow(item).id));
    return filtered.filter((show) => ids.has(show.id));
  }

  return (
    <div>
      {mode === "upcoming" && hero && <section className="relative min-h-[56vh] overflow-hidden">
        <img alt={hero.title} className="absolute inset-0 h-full w-full object-cover" src={hero.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#14181C]/10 via-[#14181C]/55 to-[#14181C]" />
        <div className="relative mx-auto flex min-h-[56vh] max-w-6xl flex-col justify-end px-4 pb-10 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#20D6AA]">{hero.festivalId ? "Festival guide" : "Upcoming near you"}</p>
          <h2 className="mt-3 max-w-3xl text-5xl font-black leading-[0.95] sm:text-7xl">{hero.title}</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#D2D9DF]">{hero.artistNames?.length ?? 0} artists · {formatDate(hero.date)} · {hero.venueName}</p>
          <button className="mt-7 w-fit bg-[#20D6AA] px-5 py-3 text-sm font-black text-black" onClick={() => openShow(hero.id)} type="button">{hero.festivalId ? "Explore festival" : "View show"}</button>
        </div>
      </section>}

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-2 border border-[#42505D] p-1">
          {(["upcoming", "past"] as CatalogMode[]).map((item) => (
            <button className={`px-4 py-3 text-sm font-black capitalize ${mode === item ? "bg-[#20D6AA] text-black" : "text-[#9AA8B4]"}`} key={item} onClick={() => setMode(item)} type="button">{item} shows</button>
          ))}
        </div>
        {mode === "past" && <div className="border-b border-white/10 py-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#47B7EF]">Your logging workflow</p><h1 className="mt-2 text-4xl font-black">Find a show you attended</h1><p className="mt-3 text-sm text-[#9AA8B4]">Rate it, write a review, and add one poster moment.</p></div>}

        <label className="flex items-center gap-3 border border-[#42505D] bg-[#202830] px-4 py-3">
          <Search className="h-5 w-5 text-[#47B7EF]" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#748391]" onChange={(event) => setQuery(event.target.value)} placeholder="Search artists, shows, venues, or city" value={query} />
          {query && <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><X className="h-4 w-4" /></button>}
        </label>

        <section className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="border border-[#42505D] bg-[#202830] px-3 py-2 text-[10px] font-black uppercase text-[#81909D]">Home base
            <select className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => onHomeCityChange(event.target.value)} value={homeCity}>{locations.map((city) => <option className="bg-[#202830]" key={city} value={city}>{city}</option>)}</select>
          </label>
          <label className="border border-[#42505D] bg-[#202830] px-3 py-2 text-[10px] font-black uppercase text-[#81909D]">Artist
            <input className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none placeholder:text-[#748391]" onChange={(event) => setArtistFilter(event.target.value)} placeholder="Any artist" value={artistFilter} />
          </label>
          <label className="border border-[#42505D] bg-[#202830] px-3 py-2 text-[10px] font-black uppercase text-[#81909D]">Venue
            <select className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => setVenueFilter(event.target.value)} value={venueFilter}><option className="bg-[#202830]" value="">Any venue</option>{venues.map((venue) => <option className="bg-[#202830]" key={venue} value={venue}>{venue}</option>)}</select>
          </label>
          <label className="border border-[#42505D] bg-[#202830] px-3 py-2 text-[10px] font-black uppercase text-[#81909D]">From
            <input className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
          </label>
          <label className="border border-[#42505D] bg-[#202830] px-3 py-2 text-[10px] font-black uppercase text-[#81909D]">To
            <input className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
          </label>
        </section>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3 text-xs">
          <span className="text-[#9AA8B4]">{locationStatus} · {dataStatus}</span>
          <button className="font-black text-[#20D6AA]" onClick={() => void onSyncJamBase()} type="button">Sync JamBase</button>
        </div>

        {mode === "past" || hasStructuredFilter ? (
          <ShowRail eyebrow={`${filtered.length} matches in ${homeCity}`} openShow={openShow} shows={filtered} title={mode === "past" ? "Past shows" : "Search results"} />
        ) : <>
          {upcomingShelves.map(([title, eyebrow, items]) => <ShowRail eyebrow={eyebrow} key={title} openShow={openShow} shows={filteredShelf(items)} title={title} />)}
          <ShowRail eyebrow={`${filtered.length} upcoming events in ${homeCity}`} openShow={openShow} shows={filtered} title="All upcoming" />
        </>}
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
  const isPast = show.date < todayIso();
  const isFestival = detail.artists.length > 1 && Boolean(
    show.festivalId || /festival|fest|outside lands/i.test(show.title),
  );
  const planningAttendees = detail.attendees.filter(
    (attendee) => attendee.status === "interested" || attendee.status === "going",
  );

  return (
    <div>
      <section className="relative min-h-[54vh] overflow-hidden">
        <img alt={show.title} className="absolute inset-0 h-full w-full object-cover" src={show.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#14181C]/65 to-[#14181C]" />
        <div className="relative mx-auto flex min-h-[54vh] max-w-6xl flex-col justify-end px-4 pb-8 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#47B7EF]">{isFestival ? "Festival" : isPast ? "Past show" : "Upcoming show"} · {show.day} · {show.time}</p>
          <h1 className="mt-3 max-w-4xl text-5xl font-black leading-none sm:text-7xl">{show.title}</h1>
          <button className="mt-4 flex w-fit items-center gap-2 text-sm text-[#B8C2CC]" onClick={() => show.venueId && openVenue(show.venueId)} type="button"><MapPin className="h-4 w-4" /> {show.venueName}, {show.city}</button>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <section className="grid grid-cols-3 border border-[#42505D] bg-[#202830] p-5 text-center">
            {isPast ? <>
              <Stat label="rating" value={detail.ratingCount ? detail.rating.toFixed(1) : "New"} />
              <Stat label="verified logs" value={String(detail.ratingCount)} />
              <Stat label="moments" value={String(detail.media.length)} />
            </> : <>
              <Stat label="interested" value={String(detail.attendanceCounts.interested)} />
              <Stat label="going" value={String(detail.attendanceCounts.going)} />
              <Stat label="artists" value={String(detail.artists.length)} />
            </>}
          </section>

          {isPast ? <button className="mt-5 w-full bg-[#20D6AA] px-5 py-4 text-sm font-black text-black" onClick={() => setLogOpen(true)} type="button">{detail.attendanceStatus === "logged" ? "Edit your show log" : "Log this show"}</button> : <div className="mt-5 grid grid-cols-2 gap-2">
            {(["interested", "going"] as Attendance[]).map((status) => <button className={`border px-3 py-3 text-xs font-black capitalize ${detail.attendanceStatus === status ? "border-[#20D6AA] bg-[#20D6AA] text-black" : "border-[#42505D] text-[#B8C2CC]"}`} disabled={operation !== "idle"} key={status} onClick={() => setAttendance(status)} type="button">{status}</button>)}
          </div>}
          {error && <p className="mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}

          <section className="mt-9">
            <SectionTitle eyebrow={isFestival ? `${detail.artists.length} artists on one festival page` : "Artist and song previews"} title={isFestival ? "Festival lineup" : "Lineup"} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {detail.artists.map((lineupArtist) => <article className="border border-[#42505D] bg-[#202830] p-4" key={lineupArtist._id}>
                <button className="flex w-full items-center gap-3 text-left" onClick={() => openArtist(lineupArtist._id)} type="button">
                  <img alt={lineupArtist.name} className="h-14 w-14 object-cover" src={resolveShowImage(lineupArtist.image, [lineupArtist.name])} />
                  <span className="min-w-0"><b className="block truncate">{lineupArtist.name}</b><small className="text-[#81909D]">{lineupArtist.genres.slice(0, 2).join(" · ") || "Live artist"}</small></span>
                </button>
                <div className="mt-3 space-y-2">{tracksFor(lineupArtist.name).slice(0, 2).map((track) => <button className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-xs ${selectedSong === track ? "border-[#20D6AA] text-[#20D6AA]" : "border-[#34414D] text-[#B8C2CC]"}`} key={track} onClick={() => setSelectedSong(track)} type="button"><Music2 className="h-3 w-3" /> Preview {track}</button>)}</div>
              </article>)}
            </div>
          </section>

          {isPast ? <>
            <section className="mt-9">
              <SectionTitle eyebrow="Verified attendees only" title="Community notes" />
              <div className="mt-4 divide-y divide-white/10 border-y border-white/10">{detail.logs.length ? detail.logs.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="Be the first person to log this show." />}</div>
            </section>
            <section className="mt-9">
              <SectionTitle eyebrow="Convex Storage" title="Poster moments" />
              {detail.media.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{detail.media.map((item) => item.url ? <img alt={item.caption ?? show.title} className="aspect-square w-full object-cover" key={item._id} src={item.url} /> : null)}</div> : <EmptyLine text="No uploaded posters yet." />}
            </section>
            <ShowRail eyebrow="Based on this show" openShow={openShow} shows={collapseFestivalShows(detail.recommendedShows.map((item) => adaptShow(item)))} title="What to see next" />
          </> : <section className="mt-9">
            <SectionTitle eyebrow="Friends and second-degree showgoers" title="Who is planning to go" />
            {planningAttendees.length ? <div className="mt-4 divide-y divide-white/10 border-y border-white/10">{planningAttendees.map((attendee) => <div className="flex items-center gap-3 py-4" key={attendee._id}><Avatar color={attendee.user?.avatarColor} name={attendee.user?.handle ?? "showgoer"} /><div className="flex-1"><b>@{attendee.user?.handle ?? "showgoer"}</b><p className="text-xs capitalize text-[#81909D]">{attendee.status}</p></div></div>)}</div> : <EmptyLine text="Be the first friend to mark interest." />}
          </section>}
        </div>

        <aside className="space-y-5">
          {detail.venue && <button className="w-full border border-[#42505D] bg-[#202830] p-5 text-left" onClick={() => openVenue(detail.venue!._id)} type="button"><p className="text-xs font-black uppercase text-[#47B7EF]">Venue {isPast ? "archive" : "review"}</p><h2 className="mt-2 text-2xl font-black">{detail.venue.name}</h2><p className="mt-2 text-sm text-[#9AA8B4]">{detail.venue.city}, {detail.venue.region}</p><p className="mt-4 text-sm leading-6 text-[#B8C2CC]">{detail.venue.description || "Open the venue page for its past and upcoming calendar."}</p></button>}
          {show.jambaseUrl && <a className="flex items-center justify-between border border-[#42505D] p-4 text-sm" href={show.jambaseUrl} rel="noreferrer" target="_blank">JamBase event data <ExternalLink className="h-4 w-4" /></a>}
          {show.ticketUrl && <a className="flex items-center justify-between bg-[#47B7EF] p-4 text-sm font-black text-black" href={show.ticketUrl} rel="noreferrer" target="_blank">Tickets <Ticket className="h-4 w-4" /></a>}
          {!isPast && artist && <button className="w-full border border-[#42505D] px-5 py-4 text-sm font-black text-[#20D6AA]" onClick={() => openArtist(artist._id)} type="button">Open artist profile</button>}
        </aside>
      </div>

      {isPast && logOpen && (
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

function ArtistView({ detail, onBack, openShow, onFollow }: { detail: LiveState["artistDetail"]; onBack: () => void; openShow: (id: string) => void; onFollow: (id: string) => Promise<unknown> }) {
  if (detail === undefined) return <StatusPanel title="Loading artist" detail="Reading the seeded JamBase profile..." loading />;
  if (!detail) return <StatusPanel title="Artist unavailable" detail="Return to the show and choose another artist." />;
  const artist = detail.artist;
  const shows = collapseFestivalShows(detail.shows.map((show) => adaptShow(show)));
  const upcoming = shows.filter((show) => show.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((show) => show.date < todayIso()).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <BackButton onClick={onBack} />
    <section className="mt-6 grid gap-5 sm:grid-cols-[180px_1fr]"><img alt={artist.name} className="aspect-square w-full object-cover" src={resolveShowImage(artist.image, [artist.name])} /><div><p className="text-xs font-black uppercase text-[#20D6AA]">Artist · {detail.ratingCount} verified ratings</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-4xl font-black">{artist.name}</h1><button className={`flex items-center gap-2 border px-4 py-2 text-sm font-black ${detail.isFollowing ? "border-[#20D6AA] bg-[#20D6AA] text-black" : "border-[#42505D]"}`} onClick={() => void onFollow(artist._id)} type="button"><Heart className={`h-4 w-4 ${detail.isFollowing ? "fill-current" : ""}`} /> {detail.isFollowing ? "Following" : "Follow"}</button></div><p className="mt-2 text-sm text-[#9AA8B4]">{artist.hometown} · {artist.genres.join(" · ")} · {detail.followerCount} followers</p><p className="mt-4 max-w-2xl text-sm leading-6 text-[#B8C2CC]">{artist.bio}</p><div className="mt-4 flex flex-wrap gap-2">{tracksFor(artist.name).map((track) => <span className="flex items-center gap-2 border border-[#34414D] px-3 py-2 text-xs text-[#B8C2CC]" key={track}><Music2 className="h-3 w-3" /> {track}</span>)}</div>{artist.jambaseUrl && <a className="mt-5 inline-flex items-center gap-2 text-sm text-[#47B7EF]" href={artist.jambaseUrl} rel="noreferrer" target="_blank">JamBase artist profile <ExternalLink className="h-4 w-4" /></a>}</div></section>
    <ShowRail eyebrow={`${upcoming.length} on the calendar`} openShow={openShow} shows={upcoming} title="Upcoming shows" />
    <ShowRail eyebrow={`${past.length} in the archive`} openShow={openShow} shows={past} title="Past shows" />
    <section className="mt-9"><SectionTitle eyebrow="Verified show logs" title="Reviews" /><div className="mt-4 divide-y divide-white/10">{detail.reviews.length ? detail.reviews.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="No artist reviews yet." />}</div></section>
  </div>;
}

function VenueView({ detail, onBack, openShow, onFollow }: { detail: LiveState["venueDetail"]; onBack: () => void; openShow: (id: string) => void; onFollow: (id: string) => Promise<unknown> }) {
  if (detail === undefined) return <StatusPanel title="Loading venue" detail="Reading the venue archive..." loading />;
  if (!detail) return <StatusPanel title="Venue unavailable" detail="Return to the show and choose another venue." />;
  const venue = detail.venue;
  const shows = collapseFestivalShows(detail.shows.map((show) => adaptShow(show)));
  const upcoming = shows.filter((show) => show.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((show) => show.date < todayIso()).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><BackButton onClick={onBack} /><section className="mt-6"><img alt={venue.name} className="aspect-[16/7] w-full object-cover" src={resolveShowImage(venue.image, [venue.name])} /><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-[#47B7EF]">Venue</p><h1 className="mt-2 text-4xl font-black">{venue.name}</h1><p className="mt-2 flex items-center gap-2 text-sm text-[#9AA8B4]"><MapPin className="h-4 w-4" /> {venue.city}, {venue.region}</p></div><div className="flex items-center gap-4"><div className="text-right"><strong className="text-3xl text-[#20D6AA]">{detail.ratingCount ? detail.rating.toFixed(1) : "New"}</strong><p className="text-[10px] text-[#81909D]">{detail.ratingCount} ratings</p></div><button className={`flex items-center gap-2 border px-4 py-2 text-sm font-black ${detail.isFollowing ? "border-[#20D6AA] bg-[#20D6AA] text-black" : "border-[#42505D]"}`} onClick={() => void onFollow(venue._id)} type="button"><Heart className={`h-4 w-4 ${detail.isFollowing ? "fill-current" : ""}`} /> {detail.isFollowing ? "Following" : "Follow"}</button></div></div><p className="mt-2 text-xs text-[#81909D]">{detail.followerCount} followers</p><p className="mt-5 max-w-3xl text-sm leading-6 text-[#B8C2CC]">{venue.description}</p><div className="mt-5 flex gap-3">{venue.website && <a className="flex items-center gap-2 border border-[#42505D] px-4 py-3 text-sm" href={venue.website} rel="noreferrer" target="_blank">Website <ExternalLink className="h-4 w-4" /></a>}{venue.jambaseUrl && <a className="flex items-center gap-2 border border-[#42505D] px-4 py-3 text-sm" href={venue.jambaseUrl} rel="noreferrer" target="_blank">JamBase <ExternalLink className="h-4 w-4" /></a>}</div></section><ShowRail eyebrow={`${upcoming.length} on the calendar`} openShow={openShow} shows={upcoming} title="Upcoming shows" /><ShowRail eyebrow={`${past.length} in the archive`} openShow={openShow} shows={past} title="Past shows" /><section className="mt-9"><SectionTitle eyebrow="Verified attendees" title="Venue reviews" /><div className="mt-4 divide-y divide-white/10">{detail.reviews.length ? detail.reviews.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="No venue reviews yet." />}</div></section></div>;
}

function ShowRail({ title, eyebrow, shows, openShow }: { title: string; eyebrow: string; shows: Show[]; openShow: (id: string) => void }) {
  const visibleShows = shows.slice(0, 24);
  return <section className="mt-10"><SectionTitle eyebrow={eyebrow} title={title} />{visibleShows.length ? <div className="hide-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">{visibleShows.map((show) => <ShowCard key={show.id} openShow={openShow} show={show} />)}</div> : <EmptyLine text="No shows in this shelf yet." />}</section>;
}

function ShowCard({ show, openShow }: { show: Show; openShow: (id: string) => void }) {
  const badge = show.ratingCount ? `${show.rating?.toFixed(1)} ★` : show.isJamBase ? "JAMBASE" : "NEW";
  return <button className="w-44 shrink-0 overflow-hidden border border-[#34414D] bg-[#202830] text-left sm:w-52" onClick={() => openShow(show.id)} type="button"><div className="relative aspect-[2/3]"><img alt={show.title} className="h-full w-full object-cover" src={show.image} /><span className="absolute right-2 top-2 bg-[#14181C]/90 px-2 py-1 text-xs font-black text-[#20D6AA]">{badge}</span></div><div className="p-3"><b className="block truncate">{show.artistNames?.join(" + ") || show.title}</b><p className="mt-1 truncate text-xs text-[#9AA8B4]">{formatDate(show.date)} · {show.venueName}</p><p className="mt-2 text-[10px] font-black uppercase text-[#47B7EF]">{show.loggedCount ?? 0} logged · {show.goingCount ?? 0} going</p></div></button>;
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
