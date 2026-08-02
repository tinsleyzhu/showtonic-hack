"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  AtSign,
  Bookmark,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Compass,
  ExternalLink,
  Grid3X3,
  Heart,
  Library,
  ListFilter,
  MapPin,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  X,
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
  type Venue,
} from "./data";

type View = "discover" | "show" | "diary" | "leaderboard" | "profile" | "artist" | "venue";
type Attendance = "interested" | "going" | "logged";
type DiaryFilter = "Artist" | "City" | "Genre" | "Calendar" | "Rating" | "Venue" | "Photo";

type Memory = {
  id: string;
  showId: string;
  rating: number;
  note: string;
  caption: string;
  song: string;
  vibes: string[];
  photo: string;
  date: string;
};

const artistById = new Map(artists.map((artist) => [artist.id, artist]));
const venueById = new Map(venues.map((venue) => [venue.id, venue]));

const defaultMemories: Memory[] = [
  {
    id: "memory-charli",
    showId: "charli-outside-lands",
    rating: 5,
    note: "The whole hill screamed every word. Instant favorite.",
    caption: "brat in the fog",
    song: "360",
    vibes: ["transcendent", "sweaty"],
    photo: "https://images.unsplash.com/photo-1504704911898-68304a7d2807?auto=format&fit=crop&w=900&q=80",
    date: "2026-08-07",
  },
  {
    id: "memory-doechii",
    showId: "doechii-outside-lands",
    rating: 4.5,
    note: "Best crowd control of the weekend, and it was not close.",
    caption: "main stage energy at Sutro",
    song: "Nissan Altima",
    vibes: ["sound was insane"],
    photo: "https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=900&q=80",
    date: "2026-08-08",
  },
  {
    id: "memory-rufus",
    showId: "rufus-outside-lands",
    rating: 4,
    note: "Fog arrived at exactly the right moment.",
    caption: "innerbloom, outer fog",
    song: "Innerbloom",
    vibes: ["sunset set"],
    photo: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=900&q=80",
    date: "2026-08-08",
  },
];

const tracksByArtist: Record<string, string[]> = {
  "charli-xcx": ["360", "Apple", "Von dutch"],
  "rufus-du-sol": ["Innerbloom", "Next to Me", "On My Knees"],
  doechii: ["Nissan Altima", "Denial Is a River", "Alter Ego"],
  "the-strokes": ["Last Nite", "Someday", "Reptilia"],
  tyla: ["Water", "Jump", "Truth or Dare"],
  "glass-beams": ["Mahal", "Taurus", "Mirage"],
};

const friendNotes: Record<string, { name: string; color: string; note: string }[]> = {
  "charli-outside-lands": [
    { name: "Maya", color: "#ff8a00", note: "going early for the left rail" },
    { name: "Jo", color: "#44c3a1", note: "meet by the windmill at 7:45" },
    { name: "Eli", color: "#4ea7ff", note: "bringing three friends from Oakland" },
  ],
  "rufus-outside-lands": [
    { name: "Jo", color: "#44c3a1", note: "this is my non-negotiable set" },
    { name: "Sam", color: "#f15bb5", note: "Twin Peaks sunset crew" },
  ],
  "doechii-outside-lands": [
    { name: "Maya", color: "#ff8a00", note: "everyone is talking about this set" },
    { name: "Nia", color: "#c5ee4f", note: "coming straight from Panhandle" },
  ],
};

const gallery = [
  { label: "Artist", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80", likes: 284 },
  { label: "Crowd", image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80", likes: 191 },
  { label: "Fits", image: "https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=900&q=80", likes: 146 },
  { label: "Venue", image: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=900&q=80", likes: 98 },
];

function getShowArtists(show: Show): Artist[] {
  return show.artistIds.map((id) => artistById.get(id)).filter(Boolean) as Artist[];
}

function getPrimaryArtist(show: Show) {
  return getShowArtists(show)[0];
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export default function Home() {
  const [view, setView] = useState<View>("discover");
  const [selectedShowId, setSelectedShowId] = useState("charli-outside-lands");
  const [selectedArtistId, setSelectedArtistId] = useState("charli-xcx");
  const [selectedVenueId, setSelectedVenueId] = useState("golden-gate-park");
  const [query, setQuery] = useState("");
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({
    "doechii-outside-lands": "going",
    "charli-outside-lands": "interested",
  });
  const [memories, setMemories] = useState<Memory[]>(defaultMemories);
  const [logOpen, setLogOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedVibes, setSelectedVibes] = useState<string[]>(["transcendent"]);
  const [selectedSong, setSelectedSong] = useState("360");
  const [mediaPreview, setMediaPreview] = useState("");
  const [diaryFilter, setDiaryFilter] = useState<DiaryFilter>("Photo");
  const [leaderScope, setLeaderScope] = useState("City");
  const [playingTrack, setPlayingTrack] = useState("");

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? shows[0];
  const selectedArtist = artistById.get(selectedArtistId) ?? artists[0];
  const selectedVenue = venueById.get(selectedVenueId) ?? venues[0];

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return shows.filter((show) => {
      const artist = getPrimaryArtist(show);
      const venue = venueById.get(show.venueId);
      return [show.title, artist.name, venue?.name, venue?.city].some((value) => value?.toLowerCase().includes(term));
    });
  }, [query]);

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openShow(showId: string, openLogger = false) {
    const show = shows.find((item) => item.id === showId) ?? shows[0];
    setSelectedShowId(show.id);
    setSelectedSong(getPrimaryArtist(show).topSong);
    setView("show");
    setLogOpen(openLogger);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openArtist(id: string) {
    setSelectedArtistId(id);
    navigate("artist");
  }

  function openVenue(id: string) {
    setSelectedVenueId(id);
    navigate("venue");
  }

  function setShowAttendance(status: Attendance) {
    setAttendance((current) => ({ ...current, [selectedShow.id]: status }));
    if (status === "logged") setLogOpen(true);
  }

  function toggleVibe(vibe: string) {
    setSelectedVibes((current) => current.includes(vibe) ? current.filter((item) => item !== vibe) : [...current, vibe]);
  }

  function handleMedia(files: FileList | null) {
    const file = files?.[0];
    if (file) setMediaPreview(URL.createObjectURL(file));
  }

  function saveLog() {
    setMemories((current) => [
      {
        id: crypto.randomUUID(),
        showId: selectedShow.id,
        rating,
        note: review || selectedShow.memoryPrompt,
        caption: caption || "one for the diary",
        song: selectedSong,
        vibes: selectedVibes,
        photo: mediaPreview || selectedShow.image,
        date: selectedShow.date,
      },
      ...current,
    ]);
    setAttendance((current) => ({ ...current, [selectedShow.id]: "logged" }));
    setReview("");
    setCaption("");
    setMediaPreview("");
    setLogOpen(false);
    navigate("diary");
  }

  return (
    <main className="min-h-screen bg-[#14181C] pb-24 text-[#F4F6F8]">
      <AppHeader onDiscover={() => navigate("discover")} onProfile={() => navigate("profile")} />

      {view === "discover" && (
        <DiscoverView
          openShow={openShow}
          query={query}
          searchResults={searchResults}
          setQuery={setQuery}
        />
      )}
      {view === "show" && (
        <ShowView
          attendance={attendance[selectedShow.id]}
          memories={memories.filter((memory) => memory.showId === selectedShow.id)}
          onBack={() => navigate("discover")}
          onLog={() => setShowAttendance("logged")}
          onOpenArtist={openArtist}
          onOpenVenue={openVenue}
          onSetAttendance={setShowAttendance}
          onShowSelect={openShow}
          playingTrack={playingTrack}
          setPlayingTrack={setPlayingTrack}
          show={selectedShow}
        />
      )}
      {view === "diary" && (
        <DiaryView filter={diaryFilter} memories={memories} onFilter={setDiaryFilter} openShow={openShow} />
      )}
      {view === "leaderboard" && (
        <LeaderboardView onScope={setLeaderScope} scope={leaderScope} />
      )}
      {view === "profile" && <ProfileView memories={memories} openShow={openShow} />}
      {view === "artist" && (
        <ArtistView artist={selectedArtist} onBack={() => navigate("show")} openShow={openShow} playingTrack={playingTrack} setPlayingTrack={setPlayingTrack} />
      )}
      {view === "venue" && (
        <VenueView onBack={() => navigate("show")} openShow={openShow} venue={selectedVenue} />
      )}

      <BottomNav
        current={view}
        onAdd={() => openShow(selectedShow.id, true)}
        onNavigate={navigate}
      />

      {logOpen && (
        <LogSheet
          caption={caption}
          mediaPreview={mediaPreview}
          onCaption={setCaption}
          onClose={() => setLogOpen(false)}
          onMedia={handleMedia}
          onRating={setRating}
          onReview={setReview}
          onSave={saveLog}
          onSong={setSelectedSong}
          onToggleVibe={toggleVibe}
          rating={rating}
          review={review}
          selectedSong={selectedSong}
          selectedVibes={selectedVibes}
          show={selectedShow}
        />
      )}
    </main>
  );
}

function AppHeader({ onDiscover, onProfile }: { onDiscover: () => void; onProfile: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#14181C]/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <button className="flex items-center gap-2" onClick={onDiscover} type="button">
          <span className="flex gap-1"><i className="h-3 w-3 rounded-full bg-[#FF8A00]" /><i className="h-3 w-3 rounded-full bg-[#20D6AA]" /><i className="h-3 w-3 rounded-full bg-[#47B7EF]" /></span>
          <span className="text-xl font-black">showtonic</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[#9AA8B4] sm:block">San Francisco</span>
          <button aria-label="Open profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#29323A]" onClick={onProfile} type="button"><CircleUserRound className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ current, onAdd, onNavigate }: { current: View; onAdd: () => void; onNavigate: (view: View) => void }) {
  const items: { view: View; label: string; icon: ReactNode }[] = [
    { view: "discover", label: "Discover", icon: <Compass /> },
    { view: "diary", label: "Diary", icon: <Library /> },
    { view: "leaderboard", label: "Leaders", icon: <Trophy /> },
    { view: "profile", label: "Profile", icon: <CircleUserRound /> },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#202830]/98 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid h-20 max-w-xl grid-cols-5 items-center px-2">
        {items.slice(0, 2).map((item) => <NavItem current={current} item={item} key={item.view} onNavigate={onNavigate} />)}
        <button aria-label="Log a show" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#20D6AA] text-[#20D6AA]" onClick={onAdd} type="button"><Plus className="h-7 w-7" /></button>
        {items.slice(2).map((item) => <NavItem current={current} item={item} key={item.view} onNavigate={onNavigate} />)}
      </div>
    </nav>
  );
}

function NavItem({ current, item, onNavigate }: { current: View; item: { view: View; label: string; icon: ReactNode }; onNavigate: (view: View) => void }) {
  const active = current === item.view;
  return (
    <button aria-label={item.label} className={`flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? "text-[#47B7EF]" : "text-[#9AA8B4]"}`} onClick={() => onNavigate(item.view)} type="button">
      <span className="[&>svg]:h-6 [&>svg]:w-6">{item.icon}</span>{item.label}
    </button>
  );
}

function DiscoverView({ query, setQuery, searchResults, openShow }: { query: string; setQuery: (value: string) => void; searchResults: Show[]; openShow: (id: string) => void }) {
  const outsideLands = shows.filter((show) => show.venueId === "golden-gate-park");
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[#9AA8B4]">Next weekend in San Francisco</p>
          <h1 className="mt-1 text-3xl font-black">Find your next show</h1>
        </div>
        <button className="text-xs font-bold text-[#47B7EF]" type="button">Filters</button>
      </div>

      <label className="mt-5 flex h-12 items-center gap-3 border border-[#34414D] bg-[#202830] px-4">
        <Search className="h-5 w-5 text-[#9AA8B4]" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#748391]" onChange={(event) => setQuery(event.target.value)} placeholder="Search artists, shows, or venues" value={query} />
        {query && <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><X className="h-4 w-4" /></button>}
      </label>

      {query ? (
        <ShowRail eyebrow={`${searchResults.length} matches`} openShow={openShow} showsList={searchResults} title="Search results" />
      ) : (
        <>
          <section className="mt-8 overflow-hidden border border-[#34414D] bg-[#202830]">
            <div className="grid sm:grid-cols-[1fr_280px]">
              <div className="p-5 sm:p-7">
                <p className="text-xs font-bold uppercase text-[#20D6AA]">Festival focus</p>
                <h2 className="mt-2 text-3xl font-black">Outside Lands 2026</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#B8C2CC]">Five sets your friends are saving, with live plans now and a shared weekend diary after.</p>
                <div className="mt-5 flex -space-x-2"><FriendFaces names={["Maya", "Jo", "Eli", "Nia"]} /><span className="ml-4 self-center text-xs text-[#9AA8B4]">12 friends building plans</span></div>
              </div>
              <button className="relative min-h-44 overflow-hidden text-left" onClick={() => openShow("charli-outside-lands")} type="button">
                <img alt="Outside Lands" className="absolute inset-0 h-full w-full object-cover" src={shows[0].image} />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <span className="absolute bottom-4 left-4 text-sm font-bold">Open festival pick <ChevronRight className="inline h-4 w-4" /></span>
              </button>
            </div>
          </section>

          <ShowRail eyebrow="Most logged in the Bay" openShow={openShow} showsList={[shows[0], shows[2], shows[1], shows[4]]} title="Popular this week" />
          <ShowRail eyebrow="Maya, Jo, and 9 others made plans" friends openShow={openShow} showsList={[shows[2], shows[0], shows[5], shows[1]]} title="Trending among friends" />
          <ShowRail eyebrow="Based on RUFUS DU SOL and Glass Beams" openShow={openShow} showsList={[shows[1], shows[5], shows[3], shows[2]]} title="Artists you follow" />
          <ShowRail eyebrow="Within 5 miles" openShow={openShow} showsList={[shows[5], shows[0], shows[2], shows[4]]} title="Nearby" />
          <ShowRail eyebrow="Friday through Sunday" openShow={openShow} showsList={outsideLands} title="This weekend" />

          <section className="mt-10 border-t border-white/10 pt-6">
            <SectionTitle eyebrow="Fresh ratings and one-line reviews" title="From friends" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {demoLogs.map((log) => <FriendReviewCard key={`${log.user}-${log.showId}`} log={log} openShow={openShow} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ShowRail({ title, eyebrow, showsList, openShow, friends = false }: { title: string; eyebrow: string; showsList: Show[]; openShow: (id: string) => void; friends?: boolean }) {
  return (
    <section className="mt-10 border-t border-white/10 pt-6">
      <SectionTitle eyebrow={eyebrow} title={title} />
      <div className="hide-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">
        {showsList.map((show) => <PosterCard friends={friends} key={show.id} openShow={openShow} show={show} />)}
      </div>
    </section>
  );
}

function SectionTitle({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div><h2 className="text-xl font-black sm:text-2xl">{title}</h2><p className="mt-1 text-xs text-[#81909D]">{eyebrow}</p></div>
      <button aria-label={`See all ${title}`} className="text-[#748391]" type="button"><ChevronRight /></button>
    </div>
  );
}

function PosterCard({ show, openShow, friends }: { show: Show; openShow: (id: string) => void; friends: boolean }) {
  const artist = getPrimaryArtist(show);
  const venue = venueById.get(show.venueId);
  return (
    <button className="w-[138px] shrink-0 text-left sm:w-[176px]" onClick={() => openShow(show.id)} type="button">
      <span className="relative block aspect-[2/3] overflow-hidden border border-[#34414D] bg-[#202830]">
        <img alt={show.title} className="h-full w-full object-cover transition duration-300 hover:scale-105" src={show.image} />
        <span className="absolute bottom-2 left-2 bg-black/80 px-2 py-1 text-[10px] font-bold uppercase">{formatDate(show.date)}</span>
        {friends && <span className="absolute right-2 top-2 rounded-full bg-[#20D6AA] px-2 py-1 text-[9px] font-black text-black">{friendNotes[show.id]?.length ?? 3} going</span>}
      </span>
      <span className="mt-2 block truncate text-sm font-bold">{artist.name}</span>
      <span className="mt-0.5 block truncate text-[11px] text-[#81909D]">{venue?.name}</span>
      <span className="mt-1 flex items-center gap-1 text-[10px] text-[#20D6AA]"><Star className="h-3 w-3 fill-current" /> {(4.2 + (show.id.length % 7) / 10).toFixed(1)}</span>
    </button>
  );
}

function FriendReviewCard({ log, openShow }: { log: DemoLog; openShow: (id: string) => void }) {
  const show = shows.find((item) => item.id === log.showId) ?? shows[0];
  return (
    <button className="grid grid-cols-[72px_1fr] gap-3 border border-[#34414D] bg-[#202830] p-3 text-left" onClick={() => openShow(show.id)} type="button">
      <img alt={show.title} className="aspect-[2/3] w-full object-cover" src={show.image} />
      <span>
        <span className="flex items-center gap-2"><Avatar name={log.user} /><b className="text-sm">@{log.user}</b></span>
        <span className="mt-2 flex text-[#20D6AA]">{Array.from({ length: 5 }).map((_, index) => <Star className={`h-3 w-3 ${index < Math.round(log.rating) ? "fill-current" : "opacity-25"}`} key={index} />)}</span>
        <span className="mt-2 line-clamp-3 block text-xs leading-5 text-[#B8C2CC]">“{log.note}”</span>
      </span>
    </button>
  );
}

function ShowView({ show, attendance, memories, onBack, onSetAttendance, onLog, onOpenArtist, onOpenVenue, onShowSelect, playingTrack, setPlayingTrack }: {
  show: Show; attendance?: Attendance; memories: Memory[]; onBack: () => void; onSetAttendance: (status: Attendance) => void; onLog: () => void; onOpenArtist: (id: string) => void; onOpenVenue: (id: string) => void; onShowSelect: (id: string) => void; playingTrack: string; setPlayingTrack: (track: string) => void;
}) {
  const artist = getPrimaryArtist(show);
  const venue = venueById.get(show.venueId) ?? venues[0];
  const friends = friendNotes[show.id] ?? friendNotes["charli-outside-lands"];
  const community = demoLogs.filter((log) => log.showId === show.id);
  const featured = memories[0];
  const otherShows = shows.filter((item) => item.id !== show.id).slice(0, 4);
  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <button className="flex items-center gap-2 text-sm text-[#9AA8B4]" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" /> Discover</button>
      </div>

      <section className="border-y border-white/10 bg-[#202830]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:grid-cols-[220px_1fr] sm:px-6">
          <div className="mx-auto w-44 sm:mx-0 sm:w-full"><img alt={show.title} className="aspect-[2/3] w-full border border-[#42505D] object-cover" src={show.image} /></div>
          <div className="self-end">
            <p className="text-xs font-bold uppercase text-[#20D6AA]">Outside Lands 2026</p>
            <h1 className="mt-2 text-4xl font-black sm:text-6xl">{artist.name}</h1>
            <button className="mt-3 flex items-center gap-2 text-left text-sm text-[#B8C2CC]" onClick={() => onOpenVenue(show.venueId)} type="button"><MapPin className="h-4 w-4" /> {show.stage} · {venue.name}</button>
            <p className="mt-2 text-sm text-[#9AA8B4]">{show.day}, {formatDate(show.date)} · {show.time}</p>
            <div className="mt-5 flex items-center gap-4"><strong className="text-3xl">4.7</strong><div><RatingStars value={5} /><p className="mt-1 text-[11px] text-[#81909D]">1,842 verified ratings</p></div></div>
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-b border-white/10 bg-[#14181C]/95 backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-3 px-4 py-3">
          <StatusButton active={attendance === "interested"} icon={<Bookmark />} label="Interested" onClick={() => onSetAttendance("interested")} />
          <StatusButton active={attendance === "going"} icon={<Check />} label="Going" onClick={() => onSetAttendance("going")} />
          <StatusButton active={attendance === "logged"} icon={<Plus />} label="Log" onClick={onLog} />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <section>
          <SectionTitle eyebrow="Friends and friends-of-friends" title="Who’s going" />
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {friends.map((friend) => (
              <div className="flex items-start gap-3 py-4" key={friend.name}>
                <Avatar color={friend.color} name={friend.name} /><div className="min-w-0 flex-1"><p className="text-sm font-bold">{friend.name}</p><p className="mt-1 text-sm text-[#9AA8B4]">{friend.note}</p></div><button aria-label={`Message ${friend.name}`} className="text-[#748391]" type="button"><MessageCircle className="h-5 w-5" /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <SectionTitle eyebrow="One photo · one caption · one song" title="Featured moment" />
            <article className="mt-4 border border-[#34414D] bg-[#202830]">
              <img alt="Featured show moment" className="aspect-square w-full object-cover sm:aspect-[4/3]" src={featured?.photo ?? community[0]?.photo ?? gallery[0].image} />
              <div className="p-4">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><Avatar name="maya" /><b className="text-sm">@maya</b></span><span className="flex items-center gap-1 text-xs text-[#9AA8B4]"><Heart className="h-4 w-4 fill-[#FF8A00] text-[#FF8A00]" /> 284</span></div>
                <p className="mt-4 text-lg font-bold">{featured?.caption ?? "the entire hill understood the assignment"}</p>
                <button className="mt-4 flex w-full items-center gap-3 bg-[#14181C] p-3 text-left" onClick={() => setPlayingTrack(playingTrack === artist.topSong ? "" : artist.topSong)} type="button">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#20D6AA] text-black">{playingTrack === artist.topSong ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}</span><span><b className="block text-sm">{featured?.song ?? artist.topSong}</b><span className="text-xs text-[#81909D]">{artist.name} · preview</span></span>
                </button>
              </div>
            </article>
          </div>

          <div>
            <SectionTitle eyebrow="Most liked from verified attendees" title="Show gallery" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {gallery.map((item) => (
                <button className="group relative aspect-square overflow-hidden text-left" key={item.label} type="button"><img alt={`${item.label} photos`} className="h-full w-full object-cover transition group-hover:scale-105" src={item.image} /><span className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" /><span className="absolute inset-x-3 bottom-3 flex items-end justify-between"><b className="text-sm">{item.label}</b><small className="flex items-center gap-1"><Heart className="h-3 w-3" /> {item.likes}</small></span></button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <SectionTitle eyebrow="Summarized from 418 verified reviews" title="What people remember" />
            <div className="mt-4 border-l-4 border-[#20D6AA] bg-[#202830] p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#20D6AA]"><Sparkles className="h-4 w-4" /> AI review summary</div>
              <p className="mt-3 text-sm leading-6 text-[#D2D9DF]">People consistently call out the crowd-wide singalongs, sharp production, and a set that felt bigger than its runtime. The main caveat is density near the front; longtime attendees recommend watching from the left hill for better sound and room to move.</p>
              <div className="mt-4 flex flex-wrap gap-2">{["electric crowd", "great sound", "packed front", "worth the wait"].map((tag) => <span className="bg-[#14181C] px-2 py-1 text-[11px] text-[#B8C2CC]" key={tag}>{tag}</span>)}</div>
            </div>
            <div className="mt-3 divide-y divide-white/10">
              {(community.length ? community : demoLogs.slice(0, 2)).map((log) => <ReviewRow key={`${log.user}-${log.showId}`} log={log} />)}
            </div>
          </div>
          <aside className="border border-[#34414D] bg-[#202830] p-5">
            <div className="flex items-center gap-2"><Ticket className="h-5 w-5 text-[#FF8A00]" /><h3 className="font-bold">Ticket info</h3></div>
            <dl className="mt-4 space-y-4 text-sm"><FactRow label="Festival pass" value="3-Day GA" /><FactRow label="Doors" value="11:00 AM" /><FactRow label="Set" value={`${show.time} · ${show.stage}`} /><FactRow label="Host" value="Another Planet Entertainment" /></dl>
            <a className="mt-5 flex w-full items-center justify-center gap-2 bg-[#47B7EF] px-4 py-3 text-sm font-bold text-[#0E151B]" href={show.jambaseUrl} target="_blank">View on JamBase <ExternalLink className="h-4 w-4" /></a>
          </aside>
        </section>

        <section className="mt-10 border-t border-white/10 pt-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="flex items-start gap-4"><img alt={artist.name} className="h-24 w-24 object-cover" src={artist.image} /><div><p className="text-xs font-bold uppercase text-[#81909D]">Artist</p><button className="mt-1 text-left text-2xl font-black" onClick={() => onOpenArtist(artist.id)} type="button">{artist.name}</button><p className="mt-2 line-clamp-2 text-sm text-[#9AA8B4]">{artist.bio}</p></div></div>
              <TrackList artist={artist} playingTrack={playingTrack} setPlayingTrack={setPlayingTrack} />
            </div>
            <div className="border border-[#34414D] p-5">
              <p className="text-xs font-bold uppercase text-[#81909D]">Expected set list</p>
              <ol className="mt-3 space-y-2 text-sm">{tracksByArtist[artist.id].concat(["Club classics", "Everything is romantic"]).map((track, index) => <li className="flex gap-3 border-b border-white/10 pb-2" key={track}><span className="text-[#748391]">{String(index + 1).padStart(2, "0")}</span>{track}</li>)}</ol>
            </div>
          </div>
        </section>

        <section className="mt-10 border-t border-white/10 pt-7">
          <div className="grid gap-5 sm:grid-cols-[180px_1fr_auto]"><img alt={venue.name} className="h-40 w-full object-cover" src={venue.image} /><div><p className="text-xs font-bold uppercase text-[#81909D]">Venue</p><button className="mt-1 text-left text-2xl font-black" onClick={() => onOpenVenue(venue.id)} type="button">{venue.name}</button><p className="mt-2 text-sm text-[#9AA8B4]">{venue.city}, {venue.region}</p><p className="mt-3 text-sm leading-6 text-[#B8C2CC]">{venue.description}</p></div><div className="self-start text-right"><strong className="text-3xl text-[#20D6AA]">4.4</strong><p className="text-[11px] text-[#81909D]">venue rating</p></div></div>
        </section>

        <ShowRail eyebrow={`Because you like ${artist.genres.slice(0, 2).join(" and ")}`} openShow={onShowSelect} showsList={otherShows} title="What to see next" />
      </div>
    </div>
  );
}

function StatusButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button aria-label={label} className={`flex flex-col items-center gap-1 border-r border-white/10 py-1 text-[11px] font-bold last:border-r-0 ${active ? "text-[#20D6AA]" : "text-[#9AA8B4]"}`} onClick={onClick} type="button"><span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>{label}</button>;
}

function LogSheet({ show, rating, onRating, review, onReview, caption, onCaption, selectedSong, onSong, selectedVibes, onToggleVibe, mediaPreview, onMedia, onClose, onSave }: {
  show: Show; rating: number; onRating: (value: number) => void; review: string; onReview: (value: string) => void; caption: string; onCaption: (value: string) => void; selectedSong: string; onSong: (value: string) => void; selectedVibes: string[]; onToggleVibe: (value: string) => void; mediaPreview: string; onMedia: (files: FileList | null) => void; onClose: () => void; onSave: () => void;
}) {
  const artist = getPrimaryArtist(show);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6">
      <section aria-modal="true" className="max-h-[92vh] w-full max-w-xl overflow-y-auto border border-[#42505D] bg-[#202830]" role="dialog">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#202830] px-4 py-4"><div><p className="text-xs text-[#81909D]">Log show</p><h2 className="text-lg font-black">{artist.name}</h2></div><button aria-label="Close log" onClick={onClose} type="button"><X /></button></header>
        <div className="space-y-6 p-4 sm:p-6">
          <div><p className="mb-2 text-xs font-bold uppercase text-[#81909D]">Your rating</p><RatingStars interactive onChange={onRating} value={rating} /></div>
          <div><p className="mb-2 text-xs font-bold uppercase text-[#81909D]">Who were you with?</p><div className="flex items-center gap-2"><FriendFaces names={["Maya", "Jo", "Eli"]} /><button className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#748391]" type="button"><Plus className="h-4 w-4" /></button><span className="text-xs text-[#9AA8B4]">from contacts</span></div></div>
          <div><p className="mb-2 text-xs font-bold uppercase text-[#81909D]">Show vibes</p><div className="flex flex-wrap gap-2">{vibes.map((vibe) => <button className={`border px-3 py-2 text-xs ${selectedVibes.includes(vibe) ? "border-[#20D6AA] bg-[#20D6AA] text-black" : "border-[#42505D] text-[#B8C2CC]"}`} key={vibe} onClick={() => onToggleVibe(vibe)} type="button">{vibe}</button>)}</div></div>
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase text-[#81909D]">Review</span><textarea className="min-h-24 w-full border border-[#42505D] bg-[#14181C] p-3 text-sm outline-none focus:border-[#20D6AA]" onChange={(event) => onReview(event.target.value)} placeholder={show.memoryPrompt} value={review} /></label>
          <div><p className="mb-2 text-xs font-bold uppercase text-[#81909D]">Your poster</p><div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#748391] bg-[#14181C]">{mediaPreview ? <img alt="Upload preview" className="h-full w-full object-cover" src={mediaPreview} /> : <span className="flex flex-col items-center gap-2 text-xs text-[#9AA8B4]"><Camera /> Add one photo</span>}<input accept="image/*,video/*" className="sr-only" onChange={(event) => onMedia(event.target.files)} type="file" /></label>
            <div className="space-y-3"><input className="w-full border border-[#42505D] bg-[#14181C] p-3 text-sm outline-none focus:border-[#20D6AA]" onChange={(event) => onCaption(event.target.value)} placeholder="One-line caption" value={caption} /><div className="space-y-2">{tracksByArtist[artist.id].map((track) => <button className={`flex w-full items-center gap-2 border p-2 text-left text-sm ${selectedSong === track ? "border-[#20D6AA] text-[#20D6AA]" : "border-[#42505D]"}`} key={track} onClick={() => onSong(track)} type="button"><Music2 className="h-4 w-4" />{track}{selectedSong === track && <Check className="ml-auto h-4 w-4" />}</button>)}</div></div>
          </div></div>
          <button className="w-full bg-[#20D6AA] px-5 py-4 text-sm font-black text-[#0E151B]" onClick={onSave} type="button">Save to diary</button>
        </div>
      </section>
    </div>
  );
}

function DiaryView({ memories, filter, onFilter, openShow }: { memories: Memory[]; filter: DiaryFilter; onFilter: (filter: DiaryFilter) => void; openShow: (id: string) => void }) {
  const filters: DiaryFilter[] = ["Artist", "City", "Genre", "Calendar", "Rating", "Venue", "Photo"];
  const average = memories.reduce((sum, memory) => sum + memory.rating, 0) / Math.max(1, memories.length);
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
      <div className="flex items-end justify-between"><div><p className="text-sm text-[#9AA8B4]">Your live music life</p><h1 className="mt-1 text-3xl font-black">Diary</h1></div><button aria-label="Share diary" type="button"><Share2 /></button></div>
      <section className="mt-6 grid grid-cols-3 border border-[#34414D] bg-[#202830] p-5 text-center"><ProfileStat label="shows" value={String(memories.length)} /><ProfileStat label="artists" value={String(new Set(memories.map((memory) => getPrimaryArtist(shows.find((show) => show.id === memory.showId) ?? shows[0]).id)).size)} /><ProfileStat label="average" value={average.toFixed(1)} /></section>

      <section className="mt-8"><SectionTitle eyebrow="Your Letterboxd-style top four" title="Favorite shows" /><div className="mt-4 grid grid-cols-4 gap-2">{memories.slice(0, 4).map((memory) => { const show = shows.find((item) => item.id === memory.showId) ?? shows[0]; return <button className="aspect-[2/3] overflow-hidden border border-[#34414D]" key={memory.id} onClick={() => openShow(show.id)} type="button"><img alt={show.title} className="h-full w-full object-cover" src={show.image} /></button>; })}</div></section>

      <section className="mt-8 border-t border-white/10 pt-6">
        <div className="flex items-center gap-2"><ListFilter className="h-5 w-5 text-[#47B7EF]" /><h2 className="text-xl font-black">See diary by</h2></div>
        <div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">{filters.map((item) => <button className={`shrink-0 border px-4 py-2 text-xs font-bold ${filter === item ? "border-[#47B7EF] bg-[#47B7EF] text-[#0E151B]" : "border-[#42505D] text-[#B8C2CC]"}`} key={item} onClick={() => onFilter(item)} type="button">{item}</button>)}</div>
      </section>

      {filter === "Calendar" ? <DiaryCalendar memories={memories} /> : (
        <section className="mt-6">
          <div className="flex items-center justify-between"><div><p className="text-xs uppercase text-[#81909D]">Grouped by {filter.toLowerCase()}</p><h2 className="mt-1 text-2xl font-black">{filter === "Photo" ? "Moments" : filter === "Rating" ? "Highest rated first" : `Your ${filter.toLowerCase()}s`}</h2></div><Grid3X3 className="text-[#748391]" /></div>
          <div className="mt-4 grid grid-cols-3 gap-1 sm:gap-3 md:grid-cols-4">{memories.concat(memories).map((memory, index) => { const show = shows.find((item) => item.id === memory.showId) ?? shows[0]; return <button className="group relative aspect-square overflow-hidden bg-[#202830]" key={`${memory.id}-${index}`} onClick={() => openShow(show.id)} type="button"><img alt={memory.caption} className="h-full w-full object-cover transition group-hover:scale-105" src={memory.photo} /><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 text-left"><b className="block truncate text-xs">{getPrimaryArtist(show).name}</b><small className="text-[#20D6AA]">{memory.rating} · {formatDate(memory.date)}</small></span></button>; })}</div>
        </section>
      )}
    </div>
  );
}

function DiaryCalendar({ memories }: { memories: Memory[] }) {
  const activeDays = new Set(memories.map((memory) => Number(memory.date.slice(-2))));
  return <section className="mt-6 border border-[#34414D] bg-[#202830] p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">August 2026</h2><CalendarDays className="text-[#47B7EF]" /></div><div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <b className="py-2 text-[#81909D]" key={`${day}-${index}`}>{day}</b>)}{Array.from({ length: 31 }).map((_, index) => { const day = index + 1; return <span className={`flex aspect-square items-center justify-center ${activeDays.has(day) ? "rounded-full bg-[#20D6AA] font-black text-black" : "text-[#D2D9DF]"}`} key={day}>{day}</span>; })}</div></section>;
}

function LeaderboardView({ scope, onScope }: { scope: string; onScope: (scope: string) => void }) {
  const rows = [
    { name: "@maya", value: "18 shows", note: "San Francisco", color: "#FF8A00" },
    { name: "@jo", value: "15 shows", note: "Oakland", color: "#20D6AA" },
    { name: "@eli", value: "13 shows", note: "San Francisco", color: "#47B7EF" },
    { name: "@tinsley", value: "11 shows", note: "San Francisco", color: "#F15BB5" },
  ];
  return <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6"><p className="text-sm text-[#9AA8B4]">August 2026</p><h1 className="mt-1 text-3xl font-black">Member leaderboard</h1><div className="mt-6 grid grid-cols-3 border border-[#42505D] p-1">{["City", "Artist", "Venue"].map((item) => <button className={`px-3 py-2 text-xs font-bold ${scope === item ? "bg-[#47B7EF] text-black" : "text-[#9AA8B4]"}`} key={item} onClick={() => onScope(item)} type="button">{item}</button>)}</div><section className="mt-8"><SectionTitle eyebrow={`Top showgoers by ${scope.toLowerCase()}`} title="Most active this month" /><div className="mt-4 divide-y divide-white/10">{rows.map((row, index) => <div className="grid grid-cols-[32px_44px_1fr_auto] items-center gap-3 py-4" key={row.name}><strong className="text-xl text-[#748391]">{index + 1}</strong><Avatar color={row.color} name={row.name} /><div><b>{row.name}</b><p className="text-xs text-[#81909D]">{row.note}</p></div><b className="text-sm text-[#20D6AA]">{row.value}</b></div>)}</div></section><section className="mt-9 border-t border-white/10 pt-6"><SectionTitle eyebrow="Taste match · location unlocked" title="Most similar near you" /><div className="mt-4 space-y-3">{fakeUsers.map((user, index) => <div className="flex items-center gap-3 border border-[#34414D] bg-[#202830] p-4" key={user.handle}><Avatar color={user.color} name={user.handle} /><div className="flex-1"><b>@{user.handle}</b><p className="mt-1 text-xs text-[#9AA8B4]">Also logged {user.favoriteArtists.slice(0, 2).join(" and ")}</p></div><strong className="text-2xl text-[#20D6AA]">{94 - index * 7}%</strong></div>)}</div></section></div>;
}

function ProfileView({ memories, openShow }: { memories: Memory[]; openShow: (id: string) => void }) {
  return <div className="mx-auto max-w-4xl px-4 py-7 sm:px-6"><div className="flex items-center justify-between"><div><p className="text-sm text-[#9AA8B4]">@tinsley</p><h1 className="mt-1 text-3xl font-black">Tinsley Zhu</h1></div><button aria-label="Share profile" onClick={() => navigator.share?.({ title: "My Showtonic diary", text: `${memories.length} shows and counting.` })} type="button"><Share2 /></button></div><section className="mt-6 border border-[#34414D] bg-[#263139] p-6"><p className="text-xs font-bold uppercase text-[#47B7EF]">All-time · San Francisco</p><h2 className="mt-2 text-3xl font-black">Top 8% showgoer</h2><div className="mt-7 grid grid-cols-3"><ProfileStat label="shows" value={String(memories.length + 24)} /><ProfileStat label="artists" value="21" /><ProfileStat label="venues" value="14" /></div><p className="mt-6 text-sm text-[#B8C2CC]">More active than 92% of showgoers in San Francisco.</p></section><section className="mt-8"><SectionTitle eyebrow="Your identity in four posters" title="Favorite shows" /><div className="mt-4 grid grid-cols-4 gap-2">{memories.concat(memories).slice(0, 4).map((memory, index) => { const show = shows.find((item) => item.id === memory.showId) ?? shows[0]; return <button className="aspect-[2/3] overflow-hidden border border-[#34414D]" key={`${memory.id}-${index}`} onClick={() => openShow(show.id)} type="button"><img alt={show.title} className="h-full w-full object-cover" src={show.image} /></button>; })}</div></section><section className="mt-8 border-t border-white/10 pt-6"><div className="flex items-center justify-between"><div><p className="text-xs uppercase text-[#81909D]">One photo per show</p><h2 className="mt-1 text-2xl font-black">Live grid</h2></div><span className="text-sm text-[#9AA8B4]">{memories.length} moments</span></div><div className="mt-4 grid grid-cols-3 gap-1">{memories.concat(memories, memories).map((memory, index) => <button className="aspect-square overflow-hidden" key={`${memory.id}-${index}`} onClick={() => openShow(memory.showId)} type="button"><img alt={memory.caption} className="h-full w-full object-cover" src={memory.photo} /></button>)}</div></section></div>;
}

function ArtistView({ artist, onBack, openShow, playingTrack, setPlayingTrack }: { artist: Artist; onBack: () => void; openShow: (id: string) => void; playingTrack: string; setPlayingTrack: (track: string) => void }) {
  const artistShows = shows.filter((show) => show.artistIds.includes(artist.id));
  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><button className="flex items-center gap-2 text-sm text-[#9AA8B4]" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" /> Show</button><section className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr]"><img alt={artist.name} className="aspect-square w-full object-cover" src={artist.image} /><div><p className="text-xs font-bold uppercase text-[#20D6AA]">Artist</p><h1 className="mt-2 text-4xl font-black">{artist.name}</h1><p className="mt-2 text-sm text-[#9AA8B4]">{artist.hometown} · {artist.genres.join(" · ")}</p><p className="mt-4 max-w-2xl text-sm leading-6 text-[#B8C2CC]">{artist.bio}</p><div className="mt-5 flex gap-3"><button className="bg-[#20D6AA] px-5 py-3 text-sm font-black text-black" type="button">Follow</button><button aria-label="Open Instagram" className="border border-[#42505D] px-4" type="button"><AtSign className="h-5 w-5" /></button></div></div></section><section className="mt-9"><SectionTitle eyebrow="Spotify preview concept" title="Popular songs" /><TrackList artist={artist} playingTrack={playingTrack} setPlayingTrack={setPlayingTrack} /></section><section className="mt-9 border-t border-white/10 pt-6"><SectionTitle eyebrow="Faded posters are shows you attended" title="Shows" /><div className="mt-4 flex gap-3 overflow-x-auto">{(artistShows.length ? artistShows : shows.slice(0, 4)).map((show, index) => <div className={index === 0 ? "opacity-45" : ""} key={show.id}><PosterCard friends={false} openShow={openShow} show={show} /></div>)}</div></section><section className="mt-9 border-t border-white/10 pt-6"><SectionTitle eyebrow="Only verified attendees can review" title="Show photos and highlights" /><div className="mt-4 grid grid-cols-3 gap-2">{gallery.slice(0, 3).map((item) => <img alt={item.label} className="aspect-square w-full object-cover" key={item.label} src={item.image} />)}</div></section></div>;
}

function VenueView({ venue, onBack, openShow }: { venue: Venue; onBack: () => void; openShow: (id: string) => void }) {
  const venueShows = shows.filter((show) => show.venueId === venue.id);
  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><button className="flex items-center gap-2 text-sm text-[#9AA8B4]" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" /> Show</button><section className="mt-5"><img alt={venue.name} className="aspect-[16/7] w-full object-cover" src={venue.image} /><div className="mt-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[#47B7EF]">Venue</p><h1 className="mt-2 text-4xl font-black">{venue.name}</h1><p className="mt-2 flex items-center gap-2 text-sm text-[#9AA8B4]"><MapPin className="h-4 w-4" /> {venue.city}, {venue.region}</p></div><div className="text-right"><strong className="text-3xl text-[#20D6AA]">4.4</strong><p className="text-[10px] text-[#81909D]">2,019 ratings</p></div></div><p className="mt-5 max-w-3xl text-sm leading-6 text-[#B8C2CC]">{venue.description}</p><div className="mt-5 flex flex-wrap gap-3"><button className="bg-[#20D6AA] px-5 py-3 text-sm font-black text-black" type="button">Follow</button><button className="border border-[#42505D] px-5 py-3 text-sm font-bold" type="button">Save to watchlist</button><button className="flex items-center gap-2 border border-[#42505D] px-4 text-sm" type="button">Website <ExternalLink className="h-4 w-4" /></button></div></section><section className="mt-9 border-t border-white/10 pt-6"><SectionTitle eyebrow="Upcoming and historical via JamBase" title="Shows at this venue" /><div className="mt-4 flex gap-3 overflow-x-auto">{venueShows.map((show) => <PosterCard friends={false} key={show.id} openShow={openShow} show={show} />)}</div></section><section className="mt-9 border-t border-white/10 pt-6"><SectionTitle eyebrow="Artist · crowd · sightlines · food" title="Venue photos" /><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{gallery.map((item) => <div className="relative aspect-square" key={item.label}><img alt={item.label} className="h-full w-full object-cover" src={item.image} /><span className="absolute bottom-2 left-2 bg-black/75 px-2 py-1 text-xs font-bold">{item.label}</span></div>)}</div></section><section className="mt-9 border-l-4 border-[#47B7EF] bg-[#202830] p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase text-[#47B7EF]"><Check className="h-4 w-4" /> Verified review</div><p className="mt-3 text-sm leading-6 text-[#D2D9DF]">“Beautiful setting and surprisingly good sightlines from the hill. Leave extra time for the walk between stages.”</p><p className="mt-3 text-xs text-[#81909D]">@maya · attended 4 shows here</p></section></div>;
}

function TrackList({ artist, playingTrack, setPlayingTrack }: { artist: Artist; playingTrack: string; setPlayingTrack: (track: string) => void }) {
  return <div className="mt-4 divide-y divide-white/10 border-y border-white/10">{tracksByArtist[artist.id].map((track, index) => <button className="flex w-full items-center gap-3 py-3 text-left" key={track} onClick={() => setPlayingTrack(playingTrack === track ? "" : track)} type="button"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#29323A] text-[#20D6AA]">{playingTrack === track ? <Pause className="h-3 w-3" /> : <Play className="ml-0.5 h-3 w-3" />}</span><span className="flex-1"><b className="block text-sm">{track}</b><span className="text-xs text-[#81909D]">{artist.name}</span></span><span className="text-xs text-[#748391]">0:{28 + index * 3}</span></button>)}</div>;
}

function RatingStars({ value, interactive = false, onChange }: { value: number; interactive?: boolean; onChange?: (value: number) => void }) {
  return <div aria-label={`${value} out of 5 stars`} className="flex gap-1">{[1, 2, 3, 4, 5].map((star) => <button aria-label={`${star} stars`} className={interactive ? "cursor-pointer" : "cursor-default"} disabled={!interactive} key={star} onClick={() => onChange?.(star)} type="button"><Star className={`h-6 w-6 ${value >= star ? "fill-[#20D6AA] text-[#20D6AA]" : "text-[#596875]"}`} /></button>)}</div>;
}

function ReviewRow({ log }: { log: DemoLog }) {
  return <div className="flex gap-3 py-4"><Avatar name={log.user} /><div className="flex-1"><div className="flex items-center justify-between"><b className="text-sm">@{log.user}</b><span className="flex items-center gap-1 text-xs text-[#20D6AA]"><Star className="h-3 w-3 fill-current" /> {log.rating}</span></div><p className="mt-2 text-sm text-[#B8C2CC]">{log.note}</p></div></div>;
}

function FriendFaces({ names }: { names: string[] }) {
  return <>{names.map((name, index) => <Avatar color={["#FF8A00", "#20D6AA", "#47B7EF", "#F15BB5"][index % 4]} key={name} name={name} />)}</>;
}

function Avatar({ name, color }: { name: string; color?: string }) {
  return <span aria-label={name} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#202830] text-xs font-black text-black" style={{ backgroundColor: color ?? ["#FF8A00", "#20D6AA", "#47B7EF"][name.length % 3] }}>{name.replace("@", "").slice(0, 1).toUpperCase()}</span>;
}

function FactRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><dt className="text-[#81909D]">{label}</dt><dd className="text-right font-bold">{value}</dd></div>;
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return <div className="border-r border-white/10 px-2 last:border-r-0"><strong className="block text-2xl font-black sm:text-3xl">{value}</strong><span className="mt-1 block text-[10px] uppercase text-[#81909D]">{label}</span></div>;
}
