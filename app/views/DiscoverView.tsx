"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { dateRangeForPreset, reasonForShow } from "../discover.js";
import { prioritizeShowsByArtists } from "../onboarding.js";
import { ArtistsDirectoryView, VenuesDirectoryView } from "./EntityViews";
import {
  adaptShow,
  collapseFestivalShows,
  formatDate,
  ShowRail,
  todayIso,
  type CatalogMode,
  type LiveState,
  type Show,
} from "./shared";

type DiscoverScope = "shows" | "artists" | "venues";
type DatePreset = "any" | "tonight" | "weekend" | "custom";

export function DiscoverView({
  dataStatus,
  discovery,
  favoriteArtists,
  followedArtistNames,
  homeCity,
  locationStatus,
  mode,
  onHomeCityChange,
  onMode,
  onOpenBackfill,
  onSyncJamBase,
  openArtist,
  openVenue,
  query,
  setQuery,
  openShow,
}: {
  dataStatus: string;
  discovery: NonNullable<LiveState["discovery"]>;
  favoriteArtists: string[];
  followedArtistNames: string[];
  homeCity: string;
  locationStatus: string;
  mode: CatalogMode;
  onHomeCityChange: (city: string) => void;
  onMode: (mode: CatalogMode) => void;
  onOpenBackfill: () => void;
  onSyncJamBase: () => Promise<void>;
  openArtist: (id: string) => void;
  openVenue: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  openShow: (id: string, logger?: boolean) => void;
}) {
  const [scope, setScope] = useState<DiscoverScope>("shows");
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [artistFilter, setArtistFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [followedOnly, setFollowedOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const allShows = collapseFestivalShows(discovery.shows.map((show) => adaptShow(show)));
  const locations = [...new Set(allShows.map((show) => show.city).filter(Boolean))].sort() as string[];
  const venues = [...new Set(allShows.map((show) => show.venueName).filter(Boolean))].sort() as string[];
  const today = todayIso();
  const needle = query.trim().toLocaleLowerCase();
  const followedSet = new Set(followedArtistNames.map((name) => name.toLowerCase()));

  const presetRange = datePreset === "custom" || datePreset === "any"
    ? { from: dateFrom, to: dateTo }
    : dateRangeForPreset(datePreset, today);

  function matchesActiveFilters(show: Show) {
    if (mode === "upcoming" ? show.date < today : show.date >= today) return false;
    if (homeCity && show.city !== homeCity) return false;
    if (followedOnly && !(show.artistNames ?? []).some((name) => followedSet.has(name.toLowerCase()))) return false;
    if (!artistFilter || show.artistNames?.some((artist) => artist.toLocaleLowerCase().includes(artistFilter.toLocaleLowerCase()))) {
      if (venueFilter && show.venueName !== venueFilter) return false;
      if (presetRange.from && show.date < presetRange.from) return false;
      if (presetRange.to && show.date > presetRange.to) return false;
      return !needle || [show.title, show.venueName, show.city, ...(show.artistNames ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(needle));
    }
    return false;
  }
  const filtered = allShows
    .filter(matchesActiveFilters)
    .sort((left, right) =>
      mode === "upcoming" ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date),
    );
  const festival = filtered.find((show) => /outside lands/i.test(show.title) && (show.artistNames?.length ?? 0) > 1)
    ?? filtered.find((show) => show.festivalId && (show.artistNames?.length ?? 0) > 1);
  const hero = festival ?? filtered[0] ?? allShows.find((show) => show.date >= today) ?? allShows[0];
  const hasStructuredFilter = Boolean(query.trim() || artistFilter || venueFilter || followedOnly || (datePreset !== "any" && (presetRange.from || presetRange.to)));

  const reasonContext = { favoriteArtists, followedArtistNames, homeCity };
  const upcomingShelves = [
    ["From your watchlist", "Shows you saved", discovery.shelves.fromYourWatchlist ?? [], "watchlist"],
    ["Popular this week", "What showgoers are saving now", discovery.shelves.popularThisWeek, "popular"],
    ["Trending among friends", "Friends interested and going", discovery.shelves.trendingAmongFriends, "trending"],
    [
      "Taste-led picks",
      favoriteArtists.length ? "Based on your setup picks" : "Based on artists you follow and rate",
      prioritizeShowsByArtists(discovery.shelves.followedArtists, favoriteArtists),
      "taste",
    ],
    ["This weekend", homeCity, discovery.shelves.thisWeekend, "weekend"],
  ] as const;
  const filteredTasteLed = prioritizeShowsByArtists(
    discovery.shelves.followedArtists.map((show) => adaptShow(show)).filter(matchesActiveFilters),
    favoriteArtists,
  );

  function filteredShelf(items: readonly object[]) {
    const visibleIds = new Set(filtered.map((show) => show.id));
    return collapseFestivalShows(items.map((item) => adaptShow(item))).filter((show) =>
      visibleIds.has(show.id),
    );
  }

  return (
    <div>
      {scope === "shows" && mode === "upcoming" && hero && <section className="relative min-h-[56vh] overflow-hidden">
        <img alt={hero.title} className="absolute inset-0 h-full w-full object-cover" src={hero.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0908]/10 via-[#0A0908]/55 to-[#0A0908]" />
        <div className="relative mx-auto flex min-h-[56vh] max-w-6xl flex-col justify-end px-4 pb-10 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">{hero.festivalId ? "Festival guide" : "Upcoming near you"}</p>
          <h2 className="font-display mt-3 max-w-3xl text-5xl leading-[0.95] sm:text-7xl">{hero.title}</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#C9C1B4]">{hero.artistNames?.length ?? 0} artists · {formatDate(hero.date)} · {hero.venueName}</p>
          <button className="mt-7 w-fit bg-[#FF7A50] px-5 py-3 text-sm font-black text-black" onClick={() => openShow(hero.id)} type="button">{hero.festivalId ? "Explore festival" : "View show"}</button>
        </div>
      </section>}

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <label className="flex items-center gap-3 border border-[#2A2521] bg-[#141210] px-4 py-3">
          <Search className="h-5 w-5 text-[#FF7A50]" />
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#6B6258]" onChange={(event) => setQuery(event.target.value)} placeholder="Shows, artists, venues" value={query} />
          {query && <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><X className="h-4 w-4" /></button>}
        </label>

        {/* Scope tabs (design 13): Shows · Artists · Venues */}
        <div className="mt-3 grid grid-cols-3 border border-[#2A2521] p-1">
          {(["shows", "artists", "venues"] as DiscoverScope[]).map((item) => (
            <button className={`px-4 py-2 text-sm font-black capitalize ${scope === item ? "bg-[#2A2521] text-[#F5F1E8]" : "text-[#8A8177]"}`} key={item} onClick={() => setScope(item)} type="button">{item}</button>
          ))}
        </div>

        {scope !== "shows" ? (
          scope === "artists"
            ? <ArtistsDirectoryView embedded openArtist={openArtist} shows={allShows} />
            : <VenuesDirectoryView embedded openVenue={openVenue} shows={allShows} />
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 border border-[#2A2521] p-1">
              {(["upcoming", "past"] as CatalogMode[]).map((item) => (
                <button className={`px-4 py-3 text-sm font-black capitalize ${mode === item ? "bg-[#FF7A50] text-black" : "text-[#8A8177]"}`} key={item} onClick={() => onMode(item)} type="button">{item} shows</button>
              ))}
            </div>
            {mode === "past" && <div className="border-b border-white/10 py-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF7A50]">Your logging workflow</p><h1 className="font-display mt-2 text-4xl">Find a show you attended</h1><p className="mt-3 text-sm text-[#8A8177]">Rate it, write a review, and add one poster moment.</p><button className="mt-4 border border-[#2A2521] px-4 py-3 text-sm font-black text-[#4EC98F]" onClick={onOpenBackfill} type="button">Or scan your camera roll for past shows</button></div>}

            {/* Date presets (design 14): Tonight · This weekend · Custom */}
            {mode === "upcoming" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {([["any", "Any date"], ["tonight", "Tonight"], ["weekend", "This weekend"], ["custom", "Custom"]] as [DatePreset, string][]).map(([preset, label]) => (
                  <button className={`border px-4 py-2 text-xs font-bold ${datePreset === preset ? "border-[#F5F1E8] bg-[#2A2521]" : "border-[#2A2521] text-[#8A8177]"}`} key={preset} onClick={() => setDatePreset(preset)} type="button">{label}</button>
                ))}
                <button className={`border px-4 py-2 text-xs font-bold ${followedOnly ? "border-[#4EC98F] bg-[#15251C] text-[#BFE8D2]" : "border-[#2A2521] text-[#8A8177]"}`} onClick={() => setFollowedOnly(!followedOnly)} type="button">Followed only</button>
              </div>
            )}

            <section className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <label className="border border-[#2A2521] bg-[#141210] px-3 py-2 text-[10px] font-black uppercase text-[#8A8177]">Home base
                <select className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => onHomeCityChange(event.target.value)} value={homeCity}>{locations.map((city) => <option className="bg-[#141210]" key={city} value={city}>{city}</option>)}</select>
              </label>
              <label className="border border-[#2A2521] bg-[#141210] px-3 py-2 text-[10px] font-black uppercase text-[#8A8177]">Artist
                <input className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none placeholder:text-[#6B6258]" onChange={(event) => setArtistFilter(event.target.value)} placeholder="Any artist" value={artistFilter} />
              </label>
              <label className="border border-[#2A2521] bg-[#141210] px-3 py-2 text-[10px] font-black uppercase text-[#8A8177]">Venue
                <select className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => setVenueFilter(event.target.value)} value={venueFilter}><option className="bg-[#141210]" value="">Any venue</option>{venues.map((venue) => <option className="bg-[#141210]" key={venue} value={venue}>{venue}</option>)}</select>
              </label>
              {(datePreset === "custom" || mode === "past") && <>
                <label className="border border-[#2A2521] bg-[#141210] px-3 py-2 text-[10px] font-black uppercase text-[#8A8177]">From
                  <input className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
                </label>
                <label className="border border-[#2A2521] bg-[#141210] px-3 py-2 text-[10px] font-black uppercase text-[#8A8177]">To
                  <input className="mt-1 block w-full bg-transparent text-sm normal-case text-white outline-none" onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
                </label>
              </>}
            </section>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-y border-white/10 py-3 text-xs">
              <span className="text-[#8A8177]">{locationStatus} · {dataStatus}</span>
              <button className="font-black text-[#FF7A50]" onClick={() => void onSyncJamBase()} type="button">Sync JamBase</button>
            </div>

            {mode === "past" ? (
              <ShowRail eyebrow={`${filtered.length} matches in ${homeCity}`} openShow={openShow} shows={filtered} title="Past shows" />
            ) : hasStructuredFilter ? (
              <>
                <ShowRail eyebrow={favoriteArtists.length ? "Filtered by your setup picks" : "Filtered artists you follow and rate"} openShow={openShow} reasonFor={(show) => reasonForShow(show, { ...reasonContext, shelf: "taste" })} shows={filteredTasteLed} title="Taste-led picks" />
                <ShowRail eyebrow={`${filtered.length} matching shows`} openShow={openShow} reasonFor={(show) => reasonForShow(show, reasonContext)} shows={filtered} title="Search results" />
              </>
            ) : <>
              {upcomingShelves.map(([title, eyebrow, items, shelfKey]) => {
                // Empty-room rule: a shelf with nothing in it never renders.
                const shelf = filteredShelf(items);
                return shelf.length ? <ShowRail eyebrow={eyebrow} key={title} openShow={openShow} reasonFor={(show) => reasonForShow(show, { ...reasonContext, shelf: shelfKey })} shows={shelf} title={title} /> : null;
              })}
              <ShowRail eyebrow={`${filtered.length} upcoming events in ${homeCity}`} openShow={openShow} shows={filtered} title="All upcoming" />
            </>}
          </>
        )}
      </div>
    </div>
  );
}
