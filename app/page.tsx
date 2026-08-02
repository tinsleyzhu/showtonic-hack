"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Images,
  MapPin,
  Music2,
  Radio,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import {
  artists,
  demoLogs,
  fakeUsers,
  shows,
  venues,
  vibes,
  type Artist,
  type DemoLog,
  type Show,
} from "./data";

type Memory = {
  id: string;
  showId: string;
  rating: number;
  vibes: string[];
  note: string;
  media: { name: string; url: string; kind: "photo" | "video" }[];
};

type View = "festival" | "show" | "diary" | "recap" | "twins" | "artist" | "venue";
type ShowDesign = "pulse" | "scrapbook" | "archive";

const artistById = new Map(artists.map((artist) => [artist.id, artist]));
const venueById = new Map(venues.map((venue) => [venue.id, venue]));
const defaultMemories: Memory[] = [
  {
    id: "seed-charli",
    showId: "charli-outside-lands",
    rating: 5,
    vibes: ["transcendent", "sweaty", "surprise guest"],
    note: "Logged from the rail. Everyone around us knew the assignment.",
    media: [
      {
        name: "festival lights",
        url: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=900&q=80",
        kind: "photo",
      },
    ],
  },
  {
    id: "seed-doechii",
    showId: "doechii-outside-lands",
    rating: 4.5,
    vibes: ["sound was insane", "sunset set"],
    note: "The set that made me text three friends to come over.",
    media: [
      {
        name: "crowd",
        url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80",
        kind: "photo",
      },
    ],
  },
];

function getShowArtists(show: Show): Artist[] {
  return show.artistIds
    .map((artistId) => artistById.get(artistId))
    .filter(Boolean) as Artist[];
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function Stars({ value, setValue, tone = "dark" }: { value: number; setValue?: (value: number) => void; tone?: "dark" | "light" }) {
  return (
    <div className="flex gap-1" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          className={`h-9 w-9 rounded border text-lg transition ${
            value >= star
              ? "border-lime-300 bg-lime-300 text-black"
              : tone === "light"
                ? "border-black/25 bg-transparent text-black/35"
                : "border-stone-700 bg-stone-950 text-stone-500"
          } ${setValue ? "hover:border-lime-200" : "cursor-default"}`}
          disabled={!setValue}
          key={star}
          onClick={() => setValue?.(star)}
          type="button"
        >
          *
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("festival");
  const [selectedShowId, setSelectedShowId] = useState("charli-outside-lands");
  const [selectedArtistId, setSelectedArtistId] = useState("charli-xcx");
  const [selectedVenueId, setSelectedVenueId] = useState("golden-gate-park");
  const [showDesign, setShowDesign] = useState<ShowDesign>("pulse");
  const [savedShows, setSavedShows] = useState<string[]>(["doechii-outside-lands"]);
  const [memories, setMemories] = useState<Memory[]>(defaultMemories);
  const [rating, setRating] = useState(5);
  const [selectedVibes, setSelectedVibes] = useState<string[]>(["transcendent"]);
  const [note, setNote] = useState("");
  const [media, setMedia] = useState<Memory["media"]>([]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0];
  const selectedArtists = getShowArtists(selectedShow);
  const selectedVenue = venueById.get(selectedVenueId) ?? venues[0];
  const myShowIds = unique(memories.map((memory) => memory.showId));
  const myArtists = unique(
    memories.flatMap((memory) => {
      const show = shows.find((item) => item.id === memory.showId);
      return show ? getShowArtists(show).map((artist) => artist.name) : [];
    }),
  );

  const matches = useMemo(() => {
    const mySet = new Set(myArtists);
    return fakeUsers
      .map((user) => {
        const sharedArtists = user.favoriteArtists.filter((artist) => mySet.has(artist));
        const union = unique([...myArtists, ...user.favoriteArtists]).length || 1;
        const sharedShows = user.shows.filter((showId) => myShowIds.includes(showId));
        const score = Math.min(99, Math.round((sharedArtists.length / union) * 100 + sharedShows.length * 15));
        return { ...user, sharedArtists, sharedShows, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [myArtists, myShowIds]);

  const showMemories = memories.filter((memory) => memory.showId === selectedShow.id);
  const communityLogs = demoLogs.filter((log) => log.showId === selectedShow.id);
  const diaryItems = memories
    .map((memory) => ({ memory, show: shows.find((show) => show.id === memory.showId) }))
    .filter((item): item is { memory: Memory; show: Show } => Boolean(item.show));

  function openShow(showId: string) {
    setSelectedShowId(showId);
    setView("show");
  }

  function toggleSavedShow(showId: string) {
    setSavedShows((current) =>
      current.includes(showId) ? current.filter((id) => id !== showId) : [...current, showId],
    );
  }

  function openArtist(artistId: string) {
    setSelectedArtistId(artistId);
    setView("artist");
  }

  function openVenue(venueId: string) {
    setSelectedVenueId(venueId);
    setView("venue");
  }

  function logMemory() {
    setMemories((current) => [
      {
        id: crypto.randomUUID(),
        showId: selectedShow.id,
        rating,
        vibes: selectedVibes,
        note: note || selectedShow.memoryPrompt,
        media,
      },
      ...current,
    ]);
    setNote("");
    setMedia([]);
    setSelectedVibes(["transcendent"]);
    setRating(5);
    setView("diary");
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const nextMedia: Memory["media"] = Array.from(files).map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
      kind: file.type.startsWith("video") ? "video" : "photo",
    }));
    setMedia((current) => [
      ...current,
      ...nextMedia,
    ]);
  }

  function toggleVibe(vibe: string) {
    setSelectedVibes((current) =>
      current.includes(vibe) ? current.filter((item) => item !== vibe) : [...current, vibe],
    );
  }

  async function shareRecap() {
    const text = `My Outside Lands diary on Showtonic: ${myArtists.join(", ")}.`;
    if (navigator.share) {
      await navigator.share({ title: "My Showtonic recap", text });
    } else {
      await navigator.clipboard.writeText(text);
      alert("Recap text copied.");
    }
  }

  return (
    <main className="min-h-screen bg-[#0A0908] text-[#F5F1E8]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0A0908]/90 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <button className="text-left" onClick={() => setView("festival")} type="button">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#8A8177]">Outside Lands demo</p>
            <h1 className="font-serif text-2xl font-semibold">Showtonic</h1>
          </button>
          <div className="flex gap-1 rounded border border-white/10 bg-white/[0.03] p-1">
            {[
              ["festival", "Lineup"],
              ["diary", "Diary"],
              ["recap", "Recap"],
              ["twins", "Twins"],
            ].map(([target, label]) => (
              <button
                className={`rounded px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  view === target ? "bg-[#FF3B0E] text-white" : "text-[#8A8177] hover:text-[#F5F1E8]"
                }`}
                key={target}
                onClick={() => setView(target as View)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {view === "festival" && (
        <section>
          <div className="relative min-h-[76vh] overflow-hidden">
            <img
              alt="Crowd at a music festival"
              className="absolute inset-0 h-full w-full object-cover opacity-55"
              src="https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1800&q=80"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#0A0908]/60 to-[#0A0908]" />
            <div className="relative mx-auto flex min-h-[76vh] max-w-7xl flex-col justify-end px-4 pb-10 pt-24 sm:px-6">
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-[#B8F14A]">Aug 7-9, 2026 / Golden Gate Park</p>
              <h2 className="mt-4 max-w-4xl font-serif text-6xl leading-none text-white sm:text-8xl">
                Your festival memory, not just your schedule.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-200">
                Discover the set, log the feeling, upload the photo, and turn the weekend into a
                shareable diary people actually want to post.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button className="bg-[#FF3B0E] px-5 py-3 text-sm font-bold uppercase tracking-wide text-white" onClick={() => openShow("charli-outside-lands")} type="button">
                  Log a set
                </button>
                <button className="border border-white/20 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white" onClick={() => setView("twins")} type="button">
                  Find taste twins
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_360px]">
            <section>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A8177]">JamBase historical + upcoming data</p>
                  <h3 className="mt-2 font-serif text-4xl">Outside Lands lineup</h3>
                </div>
                <button className="border border-white/15 px-4 py-2 text-xs uppercase tracking-wide text-[#F5F1E8]" onClick={() => openVenue("golden-gate-park")} type="button">
                  Venue
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {["Friday", "Saturday", "Sunday"].map((day) => (
                  <div className="border border-white/10 bg-[#141210]" key={day}>
                    <div className="border-b border-white/10 px-4 py-3 font-mono text-xs uppercase tracking-[0.25em] text-[#8A8177]">{day}</div>
                    <div className="divide-y divide-white/10">
                      {shows
                        .filter((show) => show.day === day && show.venueId === "golden-gate-park")
                        .map((show) => {
                          const artist = getShowArtists(show)[0];
                          return (
                            <button className="grid w-full grid-cols-[72px_1fr] gap-4 p-4 text-left transition hover:bg-white/[0.04]" key={show.id} onClick={() => openShow(show.id)} type="button">
                              <img alt={show.title} className="h-20 w-[72px] object-cover" src={show.image} />
                              <span>
                                <span className="block font-serif text-2xl">{artist.name}</span>
                                <span className="mt-2 block font-mono text-xs uppercase tracking-wide text-[#8A8177]">{show.time} / {show.stage}</span>
                                <span className="mt-2 block text-sm text-stone-300">{artist.vibe}</span>
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <aside className="border border-white/10 bg-[#141210] p-5">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A8177]">Discover next</p>
              <h3 className="mt-2 font-serif text-3xl">Upcoming SF shows</h3>
              <div className="mt-5 space-y-3">
                {shows
                  .filter((show) => show.venueId !== "golden-gate-park")
                  .map((show) => (
                    <button className="w-full border border-white/10 p-4 text-left hover:border-[#FF3B0E]" key={show.id} onClick={() => openShow(show.id)} type="button">
                      <span className="font-serif text-xl">{show.title}</span>
                      <span className="mt-2 block font-mono text-xs uppercase tracking-wide text-[#8A8177]">{formatDate(show.date)} / {venueById.get(show.venueId)?.name}</span>
                    </button>
                  ))}
              </div>
            </aside>
          </div>
        </section>
      )}

      {view === "show" && (
        <ShowExperience
          communityLogs={communityLogs}
          design={showDesign}
          isSaved={savedShows.includes(selectedShow.id)}
          media={media}
          note={note}
          onFiles={handleFiles}
          onOpenArtist={openArtist}
          onOpenVenue={openVenue}
          onSaveMemory={logMemory}
          onToggleSaved={() => toggleSavedShow(selectedShow.id)}
          onToggleVibe={toggleVibe}
          rating={rating}
          selectedVibes={selectedVibes}
          setDesign={setShowDesign}
          setNote={setNote}
          setRating={setRating}
          show={selectedShow}
          showArtists={selectedArtists}
          showMemories={showMemories}
        />
      )}

      {view === "diary" && (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <Stats title="Your live show diary" subtitle="Photo-first, IG-grid ready" memories={memories} artistsCount={myArtists.length} />
          <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-4">
            {diaryItems.map(({ memory, show }) => (
              <button className="group relative aspect-square overflow-hidden bg-[#141210]" key={memory.id} onClick={() => openShow(show.id)} type="button">
                <img alt={show.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={memory.media[0]?.url ?? show.image} />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 text-left">
                  <span className="block font-serif text-base sm:text-2xl">{getShowArtists(show)[0].name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-[#B8F14A]">{memory.rating}/5</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {view === "recap" && (
        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[420px_1fr]">
          <div className="aspect-[9/16] border border-white/10 bg-[#F5F1E8] p-6 text-[#0A0908]">
            <div className="flex h-full flex-col">
              <p className="font-mono text-xs uppercase tracking-[0.35em]">Showtonic wrap / @tinsley</p>
              <h2 className="mt-5 font-serif text-5xl leading-none">Outside Lands 2026</h2>
              <div className="my-6 border-t border-dashed border-[#0A0908]" />
              <div className="grid grid-cols-3 gap-2">
                {diaryItems.slice(0, 6).map(({ memory, show }) => (
                  <img alt={show.title} className="aspect-square object-cover" key={memory.id} src={memory.media[0]?.url ?? show.image} />
                ))}
              </div>
              <div className="mt-auto">
                <p className="font-serif text-6xl">{memories.length}</p>
                <p className="font-mono text-xs uppercase tracking-[0.25em]">sets logged / {myArtists.length} artists / {matches[0]?.score ?? 0}% twin match</p>
                <p className="mt-4 text-sm">Top artists: {myArtists.slice(0, 4).join(", ")}</p>
              </div>
            </div>
          </div>
          <div className="self-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A8177]">Viral artifact</p>
            <h2 className="mt-2 font-serif text-5xl">A festival recap that feels like a ticket stub and an IG story had a baby.</h2>
            <p className="mt-5 max-w-2xl text-stone-300">This is the share moment: user photos, ratings, top artists, handle, and a clean Showtonic stamp. In production this exports as PNG; for the hackathon demo the native share action carries the story.</p>
            <button className="mt-7 bg-[#FF3B0E] px-5 py-4 text-sm font-bold uppercase tracking-wide text-white" onClick={shareRecap} type="button">Share recap</button>
          </div>
        </section>
      )}

      {view === "twins" && (
        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A8177]">Jaccard taste matching demo</p>
          <h2 className="mt-2 font-serif text-6xl">People who were probably near you in the crowd.</h2>
          <div className="mt-8 space-y-4">
            {matches.map((match) => (
              <article className="grid gap-4 border border-white/10 bg-[#141210] p-5 sm:grid-cols-[96px_1fr_auto]" key={match.handle}>
                <div className="flex h-20 w-20 items-center justify-center rounded-full font-serif text-3xl text-black" style={{ background: match.color }}>
                  {match.handle[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="font-serif text-3xl">@{match.handle}</h3>
                  <p className="mt-2 text-sm text-stone-300">Receipts: {match.sharedArtists.length ? match.sharedArtists.join(", ") : "shared festival energy"}{match.sharedShows.length ? ` plus ${match.sharedShows.length} overlapping sets` : ""}.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.sharedArtists.map((artist) => <span className="border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-[#B8F14A]" key={artist}>{artist}</span>)}
                  </div>
                </div>
                <p className="font-serif text-5xl text-[#B8F14A]">{match.score}%</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === "artist" && <ArtistView artistId={selectedArtistId} openShow={openShow} />}
      {view === "venue" && <VenueView venueId={selectedVenue.id} openShow={openShow} />}
    </main>
  );
}

type ShowExperienceProps = {
  communityLogs: DemoLog[];
  design: ShowDesign;
  isSaved: boolean;
  media: Memory["media"];
  note: string;
  onFiles: (files: FileList | null) => void;
  onOpenArtist: (artistId: string) => void;
  onOpenVenue: (venueId: string) => void;
  onSaveMemory: () => void;
  onToggleSaved: () => void;
  onToggleVibe: (vibe: string) => void;
  rating: number;
  selectedVibes: string[];
  setDesign: (design: ShowDesign) => void;
  setNote: (note: string) => void;
  setRating: (rating: number) => void;
  show: Show;
  showArtists: Artist[];
  showMemories: Memory[];
};

const designOptions: { id: ShowDesign; label: string; description: string }[] = [
  { id: "pulse", label: "Festival pulse", description: "During the show" },
  { id: "scrapbook", label: "Memory collage", description: "After the show" },
  { id: "archive", label: "Show archive", description: "Research + history" },
];

function ShowExperience(props: ShowExperienceProps) {
  return (
    <section>
      <div className="sticky top-[65px] z-20 border-b border-white/10 bg-[#0A0908]/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.25em] text-[#8A8177]">Show page concepts</span>
          <div className="flex min-w-max border border-white/10 bg-white/[0.03] p-1">
            {designOptions.map((option) => (
              <button
                className={`px-4 py-2 text-left transition ${props.design === option.id ? "bg-[#F5F1E8] text-black" : "text-stone-400 hover:text-white"}`}
                key={option.id}
                onClick={() => props.setDesign(option.id)}
                type="button"
              >
                <span className="block text-xs font-bold uppercase tracking-wide">{option.label}</span>
                <span className="mt-1 block text-[10px] opacity-60">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {props.design === "pulse" && <PulseShow {...props} />}
      {props.design === "scrapbook" && <ScrapbookShow {...props} />}
      {props.design === "archive" && <ArchiveShow {...props} />}
    </section>
  );
}

function PulseShow(props: ShowExperienceProps) {
  const artist = props.showArtists[0];
  const venue = venueById.get(props.show.venueId);
  const allMemories = [...props.showMemories, ...props.communityLogs.map(logToMemory)];

  return (
    <div className="bg-[#070706]">
      <div className="relative min-h-[72vh] overflow-hidden">
        <img alt={props.show.title} className="absolute inset-0 h-full w-full object-cover" src={props.show.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-[#070706]" />
        <div className="relative mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-between px-4 pb-9 pt-8 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 bg-[#B8F14A] px-3 py-2 text-xs font-bold uppercase tracking-wide text-black">
              <Radio className="h-4 w-4" /> Outside Lands live
            </div>
            <button className="flex items-center gap-2 border border-white/30 bg-black/25 px-4 py-2 text-xs font-bold uppercase tracking-wide backdrop-blur" onClick={props.onToggleSaved} type="button">
              {props.isSaved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
              {props.isSaved ? "In my plan" : "Add to plan"}
            </button>
          </div>
          <div>
            <div className="mb-5 flex flex-wrap gap-2 font-mono text-xs uppercase tracking-[0.2em] text-white">
              <span className="bg-[#FF3B0E] px-3 py-2">Starts in 2h 18m</span>
              <span className="border border-white/25 bg-black/25 px-3 py-2 backdrop-blur">{props.show.day} {props.show.time}</span>
            </div>
            <h2 className="max-w-5xl font-serif text-7xl leading-[0.9] text-white sm:text-9xl">{artist.name}</h2>
            <button className="mt-5 flex items-center gap-2 text-sm text-white" onClick={() => props.onOpenVenue(props.show.venueId)} type="button">
              <MapPin className="h-4 w-4 text-[#B8F14A]" /> {props.show.stage} at {venue?.name}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-10">
          <section className="grid border-y border-white/10 py-5 sm:grid-cols-3">
            <LiveFact icon={<Music2 className="h-5 w-5" />} label="Preview before the set" value={artist.topSong} />
            <LiveFact icon={<Users className="h-5 w-5" />} label="Friends planning this" value="Maya + 4 others" />
            <LiveFact icon={<Clock3 className="h-5 w-5" />} label="Walk from Sutro" value="12 min through Polo Field" />
          </section>

          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#8A8177]">Community signal</p>
                <h3 className="mt-2 font-serif text-4xl">Crowd pulse</h3>
              </div>
              <p className="text-sm text-[#B8F14A]">184 people checked in</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {["front left is moving", "sound is crisp", "room in the back", "fog incoming"].map((signal, index) => (
                <span className={`border px-3 py-2 text-xs uppercase tracking-wide ${index === 0 ? "border-[#B8F14A] text-[#B8F14A]" : "border-white/15 text-stone-300"}`} key={signal}>{signal}</span>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-3">
              <Images className="h-5 w-5 text-[#FF3B0E]" />
              <h3 className="font-serif text-4xl">The view from the crowd</h3>
            </div>
            <MemoryStrip memories={allMemories} fallback={props.show.image} />
          </section>
        </div>
        <MemoryComposer {...props} />
      </div>
    </div>
  );
}

function ScrapbookShow(props: ShowExperienceProps) {
  const artist = props.showArtists[0];
  const venue = venueById.get(props.show.venueId);
  const allMemories = [...props.showMemories, ...props.communityLogs.map(logToMemory)];

  return (
    <div className="bg-[#F1E9D7] text-[#191714]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
        <div className="grid min-h-[70vh] items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative min-h-[480px] sm:min-h-[620px]">
            <div className="absolute left-[4%] top-[4%] w-[68%] rotate-[-4deg] bg-white p-3 pb-14 shadow-xl">
              <img alt={props.show.title} className="aspect-[4/5] w-full object-cover" src={props.show.image} />
              <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em]">{props.show.day} / {props.show.time}</p>
            </div>
            <div className="absolute bottom-[5%] right-[3%] w-[48%] rotate-[5deg] bg-[#FF5A35] p-3 shadow-xl">
              <img alt="A crowd memory" className="aspect-square w-full object-cover grayscale" src={allMemories[0]?.media[0]?.url ?? artist.image} />
              <p className="mt-3 font-serif text-2xl text-white">we were here</p>
            </div>
            <div className="absolute right-[5%] top-[7%] max-w-44 rotate-[7deg] bg-[#B8F14A] p-4 font-mono text-xs uppercase leading-5 shadow-lg">
              {props.show.memoryPrompt}
            </div>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-black/55">Show no. 08 / Outside Lands</p>
            <h2 className="mt-4 font-serif text-7xl leading-[0.9] sm:text-9xl">{artist.name}</h2>
            <p className="mt-6 max-w-xl font-serif text-2xl leading-8">{artist.vibe}</p>
            <div className="mt-8 grid grid-cols-2 gap-px border border-black/20 bg-black/20">
              <ScrapFact icon={<CalendarDays className="h-4 w-4" />} label="When" value={`${formatDate(props.show.date)}, ${props.show.time}`} />
              <ScrapFact icon={<MapPin className="h-4 w-4" />} label="Where" value={`${props.show.stage}, ${venue?.name}`} />
              <ScrapFact icon={<Music2 className="h-4 w-4" />} label="Song on repeat" value={artist.topSong} />
              <ScrapFact icon={<Sparkles className="h-4 w-4" />} label="The feeling" value={props.selectedVibes[0] ?? "still deciding"} />
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <button className="flex items-center gap-2 bg-black px-5 py-3 text-sm font-bold uppercase tracking-wide text-white" onClick={props.onToggleSaved} type="button">
                {props.isSaved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {props.isSaved ? "Saved to weekend" : "Save show"}
              </button>
              <button className="flex items-center gap-2 border border-black/30 px-5 py-3 text-sm font-bold uppercase tracking-wide" onClick={() => navigator.share?.({ title: props.show.title })} type="button">
                <Share2 className="h-4 w-4" /> Share
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-10 border-t border-black/20 py-12 lg:grid-cols-[1fr_400px]">
          <section>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-black/50">Community contact sheet</p>
            <h3 className="mt-2 font-serif text-5xl">One set, many versions</h3>
            <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {allMemories.map((memory, index) => (
                <article className={`bg-white p-2 pb-5 shadow-md ${index % 2 ? "rotate-[1deg]" : "rotate-[-1deg]"}`} key={memory.id}>
                  <img alt={memory.note} className="aspect-square w-full object-cover" src={memory.media[0]?.url ?? props.show.image} />
                  <p className="mt-3 px-1 font-serif text-lg leading-5">{memory.note}</p>
                </article>
              ))}
            </div>
          </section>
          <MemoryComposer {...props} tone="light" />
        </div>
      </div>
    </div>
  );
}

function ArchiveShow(props: ShowExperienceProps) {
  const allMemories = [...props.showMemories, ...props.communityLogs.map(logToMemory)];
  const venue = venueById.get(props.show.venueId);

  return (
    <div>
      <div className="border-b border-white/10 bg-[#141210]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[260px_1fr_auto]">
          <img alt={props.show.title} className="aspect-square w-full object-cover" src={props.show.image} />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#B8F14A]">Verified via JamBase</p>
            <h2 className="mt-3 font-serif text-6xl leading-none">{props.showArtists.map((artist) => artist.name).join(" + ")}</h2>
            <button className="mt-5 flex items-center gap-2 text-sm text-stone-300" onClick={() => props.onOpenVenue(props.show.venueId)} type="button"><MapPin className="h-4 w-4" /> {venue?.name}, {venue?.city}</button>
          </div>
          <button className="flex h-fit items-center gap-2 border border-white/15 px-4 py-3 text-xs font-bold uppercase tracking-wide" onClick={props.onToggleSaved} type="button">
            {props.isSaved ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{props.isSaved ? "Planned" : "Plan it"}
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-10">
          <section className="grid gap-px border border-white/10 bg-white/10 sm:grid-cols-4">
            <ArchiveFact label="Date" value={`${props.show.day}, ${formatDate(props.show.date)}`} />
            <ArchiveFact label="Set time" value={props.show.time} />
            <ArchiveFact label="Stage" value={props.show.stage} />
            <ArchiveFact label="Community logs" value={String(allMemories.length + 181)} />
          </section>

          {props.showArtists.map((artist) => (
            <article className="grid gap-5 border-y border-white/10 py-6 md:grid-cols-[180px_1fr]" key={artist.id}>
              <img alt={artist.name} className="h-56 w-full object-cover md:h-full" src={artist.image} />
              <div>
                <button className="text-left font-serif text-4xl" onClick={() => props.onOpenArtist(artist.id)} type="button">{artist.name}</button>
                <p className="mt-3 max-w-2xl text-stone-300">{artist.bio}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Info label="From" value={artist.hometown} />
                  <Info label="Top song" value={artist.topSong} />
                  <Info label="Vibe" value={artist.vibe} />
                </div>
                <a className="mt-5 inline-block text-sm text-[#FF3B0E]" href={artist.jambaseUrl} rel="noreferrer" target="_blank">Open JamBase artist record</a>
              </div>
            </article>
          ))}

          <section>
            <h3 className="font-serif text-4xl">Show memories</h3>
            <MemoryStrip memories={allMemories} fallback={props.show.image} />
          </section>
        </div>
        <MemoryComposer {...props} />
      </div>
    </div>
  );
}

function MemoryComposer(props: ShowExperienceProps & { tone?: "dark" | "light" }) {
  const light = props.tone === "light";
  return (
    <aside className={`h-fit border p-5 lg:sticky lg:top-44 ${light ? "border-black/20 bg-[#FFFDF7] text-black" : "border-white/10 bg-[#141210]"}`}>
      <div className="flex items-center gap-2">
        <Camera className={`h-5 w-5 ${light ? "text-[#E83D18]" : "text-[#B8F14A]"}`} />
        <p className={`font-mono text-xs uppercase tracking-[0.25em] ${light ? "text-black/50" : "text-[#8A8177]"}`}>Log this set</p>
      </div>
      <h3 className="mt-3 font-serif text-3xl leading-8">{props.show.memoryPrompt}</h3>
      <div className="mt-5 space-y-5">
        <Stars tone={light ? "light" : "dark"} value={props.rating} setValue={props.setRating} />
        <div className="flex flex-wrap gap-2">
          {vibes.map((vibe) => (
            <button
              className={`border px-3 py-2 text-xs uppercase tracking-wide transition ${props.selectedVibes.includes(vibe) ? "border-[#FF3B0E] bg-[#FF3B0E] text-white" : light ? "border-black/20 text-black/65" : "border-white/10 text-stone-300"}`}
              key={vibe}
              onClick={() => props.onToggleVibe(vibe)}
              type="button"
            >{vibe}</button>
          ))}
        </div>
        <textarea
          className={`min-h-28 w-full border p-3 text-sm outline-none focus:border-[#FF3B0E] ${light ? "border-black/20 bg-white text-black placeholder:text-black/40" : "border-white/10 bg-[#0A0908] text-[#F5F1E8] placeholder:text-[#8A8177]"}`}
          onChange={(event) => props.setNote(event.target.value)}
          placeholder="Tiny memory, best lyric, who you were with..."
          value={props.note}
        />
        <label className={`flex cursor-pointer items-center justify-center gap-2 border border-dashed p-4 text-center text-sm hover:border-[#FF3B0E] ${light ? "border-black/25 text-black/60" : "border-white/20 text-stone-300"}`}>
          <Camera className="h-4 w-4" /> Upload photos or videos
          <input accept="image/*,video/*" className="sr-only" multiple onChange={(event) => props.onFiles(event.target.files)} type="file" />
        </label>
        {props.media.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {props.media.map((item) => item.kind === "video" ? <video className="aspect-square object-cover" key={item.url} src={item.url} /> : <img alt={item.name} className="aspect-square object-cover" key={item.url} src={item.url} />)}
          </div>
        )}
        <button className="w-full bg-[#FF3B0E] px-5 py-4 text-sm font-bold uppercase tracking-wide text-white" onClick={props.onSaveMemory} type="button">Save memory</button>
        <p className={`text-center text-xs ${light ? "text-black/45" : "text-[#8A8177]"}`}>Private by default. Choose what joins the community collage.</p>
      </div>
    </aside>
  );
}

function MemoryStrip({ memories, fallback }: { memories: Memory[]; fallback: string }) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {memories.slice(0, 3).map((memory) => (
        <article className="group relative aspect-square overflow-hidden bg-[#141210]" key={memory.id}>
          <img alt={memory.note} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" src={memory.media[0]?.url ?? fallback} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
            <p className="line-clamp-2 text-sm text-white">{memory.note}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function LiveFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3 border-white/10 py-4 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0">
      <span className="text-[#B8F14A]">{icon}</span>
      <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8177]">{label}</p><p className="mt-1 text-sm text-stone-200">{value}</p></div>
    </div>
  );
}

function ScrapFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="bg-[#F1E9D7] p-4"><div className="flex items-center gap-2 text-black/50">{icon}<p className="font-mono text-[10px] uppercase tracking-[0.2em]">{label}</p></div><p className="mt-2 text-sm">{value}</p></div>;
}

function ArchiveFact({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#0A0908] p-4"><p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#8A8177]">{label}</p><p className="mt-2 font-serif text-2xl">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-[#0A0908] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#8A8177]">{label}</p>
      <p className="mt-2 text-sm text-stone-200">{value}</p>
    </div>
  );
}

function Stats({ title, subtitle, memories, artistsCount }: { title: string; subtitle: string; memories: Memory[]; artistsCount: number }) {
  const average = memories.reduce((sum, memory) => sum + memory.rating, 0) / memories.length;
  return (
    <div className="grid gap-6 border-b border-white/10 pb-8 md:grid-cols-[1fr_auto_auto_auto]">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A8177]">{subtitle}</p>
        <h2 className="mt-2 font-serif text-6xl">{title}</h2>
      </div>
      <Stat label="sets" value={String(memories.length)} />
      <Stat label="artists" value={String(artistsCount)} />
      <Stat label="avg" value={average.toFixed(1)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 border border-white/10 bg-[#141210] p-4">
      <p className="font-serif text-5xl text-[#B8F14A]">{value}</p>
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#8A8177]">{label}</p>
    </div>
  );
}

function logToMemory(log: DemoLog): Memory {
  return {
    id: `${log.user}-${log.showId}`,
    showId: log.showId,
    rating: log.rating,
    vibes: log.vibes,
    note: `@${log.user}: ${log.note}`,
    media: [{ name: log.user, url: log.photo, kind: "photo" }],
  };
}

function ArtistView({ artistId, openShow }: { artistId: string; openShow: (showId: string) => void }) {
  const artist = artistById.get(artistId) ?? artists[0];
  const artistShows = shows.filter((show) => show.artistIds.includes(artist.id));
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        <img alt={artist.name} className="aspect-[4/5] w-full object-cover" src={artist.image} />
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#8A8177]">{artist.hometown}</p>
          <h2 className="mt-2 font-serif text-7xl">{artist.name}</h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-300">{artist.bio}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {artist.genres.map((genre) => <span className="border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-stone-300" key={genre}>{genre}</span>)}
          </div>
          <a className="mt-6 inline-block text-[#FF3B0E]" href={artist.jambaseUrl} rel="noreferrer" target="_blank">JamBase profile</a>
          <h3 className="mt-10 font-serif text-4xl">Shows</h3>
          <div className="mt-4 grid gap-3">
            {artistShows.map((show) => (
              <button className="border border-white/10 bg-[#141210] p-4 text-left hover:border-[#FF3B0E]" key={show.id} onClick={() => openShow(show.id)} type="button">
                <span className="font-serif text-2xl">{show.title}</span>
                <span className="mt-2 block font-mono text-xs uppercase tracking-wide text-[#8A8177]">{formatDate(show.date)} / {show.stage}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function VenueView({ venueId, openShow }: { venueId: string; openShow: (showId: string) => void }) {
  const venue = venueById.get(venueId) ?? venues[0];
  const venueShows = shows.filter((show) => show.venueId === venue.id);
  return (
    <section>
      <div className="relative min-h-[48vh] overflow-hidden">
        <img alt={venue.name} className="absolute inset-0 h-full w-full object-cover opacity-60" src={venue.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-[#0A0908]" />
        <div className="relative mx-auto flex min-h-[48vh] max-w-7xl flex-col justify-end px-4 pb-8 sm:px-6">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#B8F14A]">{venue.city}, {venue.region}</p>
          <h2 className="mt-2 font-serif text-7xl">{venue.name}</h2>
          <p className="mt-4 max-w-2xl text-stone-200">{venue.description}</p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h3 className="font-serif text-4xl">Shows at this venue</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {venueShows.map((show) => (
            <button className="grid grid-cols-[96px_1fr] gap-4 border border-white/10 bg-[#141210] p-4 text-left hover:border-[#FF3B0E]" key={show.id} onClick={() => openShow(show.id)} type="button">
              <img alt={show.title} className="h-24 w-24 object-cover" src={show.image} />
              <span>
                <span className="font-serif text-2xl">{getShowArtists(show).map((artist) => artist.name).join(" + ")}</span>
                <span className="mt-2 block font-mono text-xs uppercase tracking-wide text-[#8A8177]">{formatDate(show.date)} / {show.time} / {show.stage}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
