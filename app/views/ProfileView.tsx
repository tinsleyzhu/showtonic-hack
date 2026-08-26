"use client";

import { useState } from "react";
import { CalendarDays, Check, Heart, ListFilter, MapPin, Share2 } from "lucide-react";
import { AgentAccess } from "./AgentAccess";
import { SquadPlanCard } from "./SquadPlan";
import { groupMemories, resolveShowImage, toMemory, type LiveMemory } from "../liveData.js";
import {
  Avatar,
  EmptyLine,
  formatDate,
  LOW_N_THRESHOLD,
  PageTitle,
  SectionTitle,
  Stat,
  StatusPanel,
  type DiaryFilter,
  type LiveState,
} from "./shared";

export function ProfileView({ profile, memories, filter, onFilter, openShow, openArtist, openVenue, onSignOut, onSetFavorites, userId }: { userId: import("../../convex/_generated/dataModel").Id<"users">; profile: LiveState["profile"]; memories: LiveMemory[]; filter: DiaryFilter; onFilter: (filter: DiaryFilter) => void; openShow: (id: string) => void; openArtist: (id: string) => void; openVenue: (id: string) => void; onSignOut: () => void; onSetFavorites: (logIds: string[]) => Promise<unknown> }) {
  const [editingFavorites, setEditingFavorites] = useState(false);
  const [pinDraft, setPinDraft] = useState<string[]>([]);
  const [favoritesError, setFavoritesError] = useState("");

  if (profile === undefined) return <StatusPanel title="Loading profile" detail="Calculating your live music stats..." loading />;
  if (!profile) return <StatusPanel title="Profile unavailable" detail="Reload to retry your local identity." />;

  const lowN = profile.stats.shows < LOW_N_THRESHOLD;

  function startEditingFavorites() {
    setPinDraft(profile!.favoriteShows.map((log) => String(log._id)));
    setFavoritesError("");
    setEditingFavorites(true);
  }

  function togglePin(logId: string) {
    setFavoritesError("");
    setPinDraft((current) => {
      if (current.includes(logId)) return current.filter((id) => id !== logId);
      if (current.length >= 4) {
        setFavoritesError("Four favorites max — unpin one first.");
        return current;
      }
      return [...current, logId];
    });
  }

  async function savePins() {
    try {
      await onSetFavorites(pinDraft);
      setEditingFavorites(false);
    } catch (error) {
      setFavoritesError(error instanceof Error ? error.message : "Could not save favorites");
    }
  }

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><div className="flex items-center justify-between gap-4"><PageTitle eyebrow={`@${profile.user.handle}`} title="Your diary" /><div className="flex items-center gap-4"><button className="text-xs font-black text-[#8A8177] hover:text-white" onClick={onSignOut} type="button">Switch account</button><button aria-label="Share profile" onClick={() => navigator.share?.({ title: "My Showtonic diary", text: `${profile.stats.shows} shows and counting.` })} type="button"><Share2 /></button></div></div>

    {/* Stats header (design 12) — low-N rule swaps averages for potential copy */}
    <section className="mt-6 border border-[#2A2521] bg-[#1A1713] p-6">
      <p className="text-xs font-black uppercase text-[#FF7A50]">Your live music archive</p>
      <h2 className="font-display mt-2 text-3xl">{profile.stats.shows} shows and counting</h2>
      {lowN ? (
        <p className="mt-5 border-l-2 border-[#4EC98F] pl-3 text-sm leading-6 text-[#C9C1B4]">
          Log {LOW_N_THRESHOLD - profile.stats.shows} more {LOW_N_THRESHOLD - profile.stats.shows === 1 ? "show" : "shows"} to unlock your stats — or scan your camera roll from the Log tab.
        </p>
      ) : (
        <div className="mt-7 grid grid-cols-4 text-center">
          <Stat label="shows" value={String(profile.stats.shows)} />
          <Stat label="artists" value={String(profile.stats.artists)} />
          <Stat label="venues" value={String(profile.stats.venues)} />
          <Stat label="average" value={profile.stats.averageRating ? profile.stats.averageRating.toFixed(1) : "—"} />
        </div>
      )}
    </section>

    {/* Nudge card (design 12) until favorites are deliberately pinned */}
    {!profile.hasPinnedFavorites && memories.length > 0 && (
      <section className="mt-4 border-l-2 border-[#6FBCD3] bg-[#141210] p-4">
        <b className="text-sm">Next: make it yours</b>
        <p className="mt-1 text-xs leading-5 text-[#8A8177]">Pin four favorite shows, add posters, or browse upcoming shows recommended from this history.</p>
      </section>
    )}

    <section className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <SectionTitle eyebrow={profile.hasPinnedFavorites ? "Pinned by you" : "Highest verified ratings"} title="Favorite shows" />
        {memories.length > 0 && (
          editingFavorites ? (
            <span className="flex items-center gap-3">
              <button className="text-xs font-black text-[#8A8177]" onClick={() => setEditingFavorites(false)} type="button">Cancel</button>
              <button className="bg-[#FF7A50] px-3 py-2 text-xs font-black text-black" onClick={() => void savePins()} type="button">Save {pinDraft.length}/4</button>
            </span>
          ) : (
            <button className="text-xs font-black text-[#4EC98F]" onClick={startEditingFavorites} type="button">Edit</button>
          )
        )}
      </div>
      {favoritesError && <p className="mt-2 text-xs text-[#F97354]">{favoritesError}</p>}
      {editingFavorites ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {memories.map((memory) => {
            const pinned = pinDraft.includes(memory.id);
            return (
              <button className={`relative aspect-[2/3] overflow-hidden border-2 ${pinned ? "border-[#4EC98F]" : "border-[#2A2521]"}`} key={memory.id} onClick={() => togglePin(memory.id)} type="button">
                <img alt={memory.artistNames.join(" + ")} className="h-full w-full object-cover" src={memory.photo} />
                {pinned && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#4EC98F]"><Check className="h-3 w-3 text-black" /></span>}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1 text-left"><small className="block truncate text-[10px]">{memory.artistNames.join(" + ")}</small></span>
              </button>
            );
          })}
        </div>
      ) : profile.favoriteShows.length ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {profile.favoriteShows.map((log) => { const memory = toMemory(log as Record<string, unknown>); return <button className="aspect-[2/3] overflow-hidden border border-[#2A2521]" key={log._id} onClick={() => openShow(log.showId)} type="button"><img alt={log.showTitle} className="h-full w-full object-cover" src={memory.photo} /></button>; })}
        </div>
      ) : <EmptyLine text="Your top shows will appear after you log them." />}
    </section>

    <section className="mt-10 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-2"><div><SectionTitle eyebrow="Based on verified logs" title="Top artists" /><div className="mt-4 divide-y divide-white/10">{profile.topArtists.length ? profile.topArtists.map((item, index) => item.artist ? <button className="flex w-full items-center gap-3 py-3 text-left" key={item.name} onClick={() => openArtist(item.artist!._id)} type="button"><span className="w-6 text-lg font-black text-[#6B6258]">{index + 1}</span><img alt={item.name} className="h-10 w-10 object-cover" src={resolveShowImage(item.artist.image, [item.name])} /><span className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><small className="text-[#8A8177]">{item.count} attended</small></span></button> : null) : <EmptyLine text="Log shows to rank your artists." />}</div></div><div><SectionTitle eyebrow="Based on verified logs" title="Top venues" /><div className="mt-4 divide-y divide-white/10">{profile.topVenues.length ? profile.topVenues.map((item, index) => item.venue ? <button className="flex w-full items-center gap-3 py-3 text-left" key={item.name} onClick={() => openVenue(item.venue!._id)} type="button"><span className="w-6 text-lg font-black text-[#6B6258]">{index + 1}</span><span className="flex h-10 w-10 items-center justify-center border border-[#2A2521]"><MapPin className="h-4 w-4 text-[#FF7A50]" /></span><span className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><small className="text-[#8A8177]">{item.count} attended</small></span></button> : null) : <EmptyLine text="Log shows to rank your venues." />}</div></div></section>
    <section className="mt-10 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-2"><div><SectionTitle eyebrow={`${profile.followedArtists.length} saved`} title="Artists you follow" /><div className="mt-4 flex flex-wrap gap-2">{profile.followedArtists.length ? profile.followedArtists.map((artist) => artist ? <button className="flex items-center gap-2 border border-[#2A2521] px-3 py-2 text-sm" key={artist._id} onClick={() => openArtist(artist._id)} type="button"><Heart className="h-3 w-3 fill-[#4EC98F] text-[#4EC98F]" /> {artist.name}</button> : null) : <EmptyLine text="Follow artists to keep them here." />}</div></div><div><SectionTitle eyebrow={`${profile.followedVenues.length} saved`} title="Venues you follow" /><div className="mt-4 flex flex-wrap gap-2">{profile.followedVenues.length ? profile.followedVenues.map((venue) => venue ? <button className="flex items-center gap-2 border border-[#2A2521] px-3 py-2 text-sm" key={venue._id} onClick={() => openVenue(venue._id)} type="button"><MapPin className="h-3 w-3 text-[#FF7A50]" /> {venue.name}</button> : null) : <EmptyLine text="Follow venues to keep them here." />}</div></div></section>
    <SquadPlanCard openShow={openShow} userId={userId} />
    <DiaryArchive filter={filter} memories={memories} onFilter={onFilter} openShow={openShow} />
  <AgentAccess userId={userId} />
  </div>;
}

export function DiaryArchive({ memories, filter, onFilter, openShow }: { memories: LiveMemory[]; filter: DiaryFilter; onFilter: (filter: DiaryFilter) => void; openShow: (id: string) => void }) {
  // One grid, seven sorts (design 19): Wall is the photo-first default.
  const filters: DiaryFilter[] = ["Wall", "Calendar", "Artist", "Venue", "City", "Genre", "Rating"];
  const groups = groupMemories(memories, filter);
  return <section className="mt-10 border-t border-white/10 pt-8"><div className="flex items-center gap-2"><ListFilter className="h-5 w-5 text-[#FF7A50]" /><SectionTitle eyebrow={`${memories.length} logged shows`} title="Your diary" /></div><div className="hide-scrollbar mt-4 flex gap-2 overflow-x-auto">{filters.map((item) => <button className={`shrink-0 border px-4 py-2 text-xs font-bold ${filter === item ? "border-[#FF7A50] bg-[#FF7A50] text-black" : "border-[#2A2521] text-[#C9C1B4]"}`} key={item} onClick={() => onFilter(item)} type="button">{item}</button>)}</div>{filter === "Calendar" ? <DiaryCalendar memories={memories} /> : filter === "Wall" ? memories.length ? <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">{[...memories].sort((a, b) => b.date.localeCompare(a.date)).map((memory) => <MemoryTile key={memory.id} memory={memory} openShow={openShow} />)}</div> : <EmptyLine text="Log your first show and it will appear here." /> : groups.length ? <div className="mt-7 divide-y divide-white/10 border-y border-white/10">{groups.map((group) => <section className="py-6" key={group.key}><div className="flex items-end justify-between gap-3"><div><h3 className="font-display text-xl">{group.label}</h3><p className="mt-1 text-xs text-[#8A8177]">{group.count} {group.count === 1 ? "show" : "shows"}</p></div><span className="text-xs text-[#8A8177]">Latest {formatDate(group.latestDate)}</span></div><div className="hide-scrollbar mt-4 flex gap-3 overflow-x-auto">{group.memories.map((memory) => <button className="grid w-64 shrink-0 grid-cols-[72px_1fr] overflow-hidden border border-[#2A2521] bg-[#141210] text-left" key={`${group.key}-${memory.id}`} onClick={() => openShow(memory.showId)} type="button"><img alt={memory.caption} className="h-24 w-[72px] object-cover" src={memory.photo} /><span className="min-w-0 p-3"><b className="block truncate text-sm">{memory.artistNames.join(" + ")}</b><small className="mt-1 block truncate text-[#8A8177]">{formatDate(memory.date)} · {memory.venueName}</small><small className="mt-2 block text-[#4EC98F]">{memory.rating > 0 ? `${memory.rating} stars` : "unrated"}</small></span></button>)}</div></section>)}</div> : <EmptyLine text="No diary groups yet." />}</section>;
}

export function MemoryTile({ memory, openShow }: { memory: LiveMemory; openShow: (id: string) => void }) {
  return <button className="group relative aspect-square overflow-hidden bg-[#141210]" onClick={() => openShow(memory.showId)} type="button"><img alt={memory.caption} className="h-full w-full object-cover transition group-hover:scale-105" src={memory.photo} /><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3 text-left"><b className="block truncate text-sm">{memory.artistNames.join(" + ")}</b><small className="text-[#4EC98F]">{memory.rating > 0 ? memory.rating : "unrated"} · {formatDate(memory.date)}</small></span></button>;
}

export function DiaryCalendar({ memories }: { memories: LiveMemory[] }) {
  const activeDays = new Set(memories.map((memory) => Number(memory.date.slice(-2))));
  return <section className="mt-6 border border-[#2A2521] bg-[#141210] p-5"><div className="flex items-center justify-between"><h2 className="font-display text-xl">August 2026</h2><CalendarDays className="text-[#FF7A50]" /></div><div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs">{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <b className="py-2 text-[#8A8177]" key={`${day}-${index}`}>{day}</b>)}{Array.from({ length: 31 }).map((_, index) => { const day = index + 1; return <span className={`flex aspect-square items-center justify-center ${activeDays.has(day) ? "rounded-full bg-[#4EC98F] font-black text-black" : "text-[#C9C1B4]"}`} key={day}>{day}</span>; })}</div></section>;
}

export { Avatar };
