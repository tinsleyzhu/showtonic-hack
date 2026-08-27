"use client";

import { useMemo, useState } from "react";
import { Bookmark, ExternalLink, Heart, MapPin, Music2, Search } from "lucide-react";
import { resolveShowImage } from "../liveData.js";
import { describeArtistHistory, describeVenueHistory } from "../receipts.js";
import {
  adaptShow,
  BackButton,
  collapseFestivalShows,
  DetailSkeleton,
  EmptyLine,
  InlinePanel,
  PageTitle,
  ReviewRow,
  SectionTitle,
  ShowRail,
  todayIso,
  tracksFor,
  type LiveState,
  type Show,
} from "./shared";

export function ArtistsDirectoryView({ shows, openArtist, embedded = false }: { shows: Show[]; openArtist: (id: string) => void; embedded?: boolean }) {
  const [search, setSearch] = useState("");
  const artists = useMemo(() => {
    const entries = new Map<string, { id: string; name: string; image: string; upcoming: Set<string>; past: Set<string>; latestDate: string }>();
    for (const show of collapseFestivalShows(shows)) {
      show.artistNames?.forEach((name, index) => {
        const id = show.artistIds[index];
        if (!id) return;
        const entry = entries.get(id) ?? { id, name, image: show.image, upcoming: new Set(), past: new Set(), latestDate: "" };
        (show.date >= todayIso() ? entry.upcoming : entry.past).add(show.id);
        if (show.date > entry.latestDate) entry.latestDate = show.date;
        entries.set(id, entry);
      });
    }
    return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [shows]);
  const visible = artists.filter((artist) => artist.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className={embedded ? "mt-6" : "mx-auto max-w-6xl px-4 py-8 sm:px-6"}><PageTitle eyebrow={`${artists.length} artists in your catalog`} title="Artists" /><label className="mt-6 flex items-center gap-3 border border-[#2A2521] bg-[#141210] px-4 py-3"><Search className="h-5 w-5 text-[#FF7A50]" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setSearch(event.target.value)} placeholder="Search artists" value={search} /></label><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{visible.slice(0, 100).map((artist) => <button className="overflow-hidden border border-[#2A2521] bg-[#141210] text-left" key={artist.id} onClick={() => openArtist(artist.id)} type="button"><img alt={artist.name} className="aspect-square w-full object-cover" src={artist.image} /><span className="block p-3"><b className="block truncate">{artist.name}</b><small className="mt-1 block text-[#8A8177]">{artist.upcoming.size} upcoming · {artist.past.size} past</small></span></button>)}</div></div>;
}

export function VenuesDirectoryView({ shows, openVenue, embedded = false }: { shows: Show[]; openVenue: (id: string) => void; embedded?: boolean }) {
  const [search, setSearch] = useState("");
  const venues = useMemo(() => {
    const entries = new Map<string, { id: string; name: string; city: string; image: string; upcoming: Set<string>; past: Set<string> }>();
    for (const show of collapseFestivalShows(shows)) {
      if (!show.venueId) continue;
      const entry = entries.get(show.venueId) ?? { id: show.venueId, name: show.venueName ?? "Venue", city: show.city ?? "", image: show.image, upcoming: new Set(), past: new Set() };
      (show.date >= todayIso() ? entry.upcoming : entry.past).add(show.id);
      entries.set(show.venueId, entry);
    }
    return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [shows]);
  const visible = venues.filter((venue) => `${venue.name} ${venue.city}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className={embedded ? "mt-6" : "mx-auto max-w-6xl px-4 py-8 sm:px-6"}><PageTitle eyebrow={`${venues.length} venues in your catalog`} title="Venues" /><label className="mt-6 flex items-center gap-3 border border-[#2A2521] bg-[#141210] px-4 py-3"><Search className="h-5 w-5 text-[#FF7A50]" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setSearch(event.target.value)} placeholder="Search venues or cities" value={search} /></label><div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.slice(0, 100).map((venue) => <button className="grid grid-cols-[112px_1fr] overflow-hidden border border-[#2A2521] bg-[#141210] text-left" key={venue.id} onClick={() => openVenue(venue.id)} type="button"><img alt={venue.name} className="h-28 w-28 object-cover" src={venue.image} /><span className="min-w-0 p-4"><b className="block truncate">{venue.name}</b><small className="mt-1 block text-[#8A8177]">{venue.city}</small><small className="mt-3 block text-[#8A8177]">{venue.upcoming.size} upcoming · {venue.past.size} past</small></span></button>)}</div></div>;
}

export function ArtistView({ detail, onBack, openShow, onFollow }: { detail: LiveState["artistDetail"]; onBack: () => void; openShow: (id: string) => void; onFollow: (id: string) => Promise<unknown> }) {
  if (detail === undefined) return <DetailSkeleton label="Loading this artist" />;
  if (!detail) return <InlinePanel actionLabel="Go back" detail="We could not find a profile for them. Pick another artist from the show you came from." onAction={onBack} title="This artist page is empty" />;
  const artist = detail.artist;
  const shows = collapseFestivalShows(detail.shows.map((show) => adaptShow(show)));
  const upcoming = shows.filter((show) => show.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((show) => show.date < todayIso()).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <BackButton onClick={onBack} />
    <section className="mt-6 grid gap-5 sm:grid-cols-[180px_1fr]"><img alt={artist.name} className="aspect-square w-full object-cover" src={resolveShowImage(artist.image, [artist.name])} /><div><p className="text-xs font-black uppercase text-[#FF7A50]">Artist · {detail.ratingCount} verified ratings</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-4xl">{artist.name}</h1><button className={`flex items-center gap-2 border px-4 py-2 text-sm font-black ${detail.isFollowing ? "border-[#FF7A50] bg-[#FF7A50] text-black" : "border-[#2A2521]"}`} onClick={() => void onFollow(artist._id)} type="button"><Heart className={`h-4 w-4 ${detail.isFollowing ? "fill-current" : ""}`} /> {detail.isFollowing ? "Following" : "Follow"}</button></div><p className="mt-2 text-sm text-[#8A8177]">{artist.hometown} · {artist.genres.join(" · ")} · {detail.followerCount} followers</p><p className="mt-4 max-w-2xl text-sm leading-6 text-[#C9C1B4]">{artist.bio}</p><div className="mt-4 flex flex-wrap gap-2">{tracksFor(artist.name).map((track) => <span className="flex items-center gap-2 border border-[#2A2521] px-3 py-2 text-xs text-[#C9C1B4]" key={track}><Music2 className="h-3 w-3" /> {track}</span>)}</div>{artist.jambaseUrl && <a className="mt-5 inline-flex items-center gap-2 text-sm text-[#FF7A50]" href={artist.jambaseUrl} rel="noreferrer" target="_blank">JamBase artist profile <ExternalLink className="h-4 w-4" /></a>}</div></section>
    {detail.yourHistory && (
      <section className="mt-6 border-l-2 border-[#4EC98F] bg-[#141210] p-4">
        <div className="flex items-center justify-between"><b className="text-sm">Your artist history</b><span className="text-xs font-black text-[#4EC98F]">{detail.yourHistory.showCount} {detail.yourHistory.showCount === 1 ? "show" : "shows"}</span></div>
        <p className="font-display mt-2 text-lg leading-7 text-[#F5F1E8]">{describeArtistHistory(detail.yourHistory, artist.name)}</p>
      </section>
    )}
    <ShowRail eyebrow={`${upcoming.length} on the calendar`} openShow={openShow} shows={upcoming} title="Upcoming shows" />
    <ShowRail dimUnattended eyebrow="Yours vivid — tap a faded night to reclaim it" openShow={openShow} shows={past} title="Past shows" />
    <section className="mt-9"><SectionTitle eyebrow="Verified show logs" title="Reviews" /><div className="mt-4 divide-y divide-white/10">{detail.reviews.length ? detail.reviews.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="No artist reviews yet." />}</div></section>
  </div>;
}

export function VenueView({ detail, onBack, openShow, onFollow, onToggleWatchlist }: { detail: LiveState["venueDetail"]; onBack: () => void; openShow: (id: string) => void; onFollow: (id: string) => Promise<unknown>; onToggleWatchlist: (venueId: string) => Promise<unknown> }) {
  if (detail === undefined) return <DetailSkeleton label="Loading this venue" />;
  if (!detail) return <InlinePanel actionLabel="Go back" detail="We could not find a page for it. Pick another venue from the show you came from." onAction={onBack} title="This venue page is empty" />;
  const venue = detail.venue;
  const shows = collapseFestivalShows(detail.shows.map((show) => adaptShow(show)));
  const upcoming = shows.filter((show) => show.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date));
  const past = shows.filter((show) => show.date < todayIso()).sort((a, b) => b.date.localeCompare(a.date));
  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6"><BackButton onClick={onBack} /><section className="mt-6"><img alt={venue.name} className="aspect-[16/7] w-full object-cover" src={resolveShowImage(venue.image, [venue.name])} /><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase text-[#FF7A50]">Venue</p><h1 className="font-display mt-2 text-4xl">{venue.name}</h1><p className="mt-2 flex items-center gap-2 text-sm text-[#8A8177]"><MapPin className="h-4 w-4" /> {venue.city}, {venue.region}</p></div><div className="flex items-center gap-4"><div className="text-right"><strong className="font-display text-3xl text-[#4EC98F]">{detail.ratingCount ? detail.rating.toFixed(1) : "New"}</strong><p className="text-[10px] text-[#8A8177]">{detail.ratingCount} ratings</p></div><button className={`flex items-center gap-2 border px-4 py-2 text-sm font-black ${detail.isFollowing ? "border-[#FF7A50] bg-[#FF7A50] text-black" : "border-[#2A2521]"}`} onClick={() => void onFollow(venue._id)} type="button"><Heart className={`h-4 w-4 ${detail.isFollowing ? "fill-current" : ""}`} /> {detail.isFollowing ? "Following" : "Follow"}</button><button className={`flex items-center gap-2 border px-4 py-2 text-sm font-black ${detail.isWatchlisted ? "border-[#4EC98F] text-[#4EC98F]" : "border-[#2A2521]"}`} onClick={() => void onToggleWatchlist(venue._id)} type="button"><Bookmark className={`h-4 w-4 ${detail.isWatchlisted ? "fill-current" : ""}`} /> {detail.isWatchlisted ? "Watchlisted" : "Watchlist"}</button></div></div><p className="mt-2 text-xs text-[#8A8177]">{detail.followerCount} followers</p>{detail.yourHistory && <section className="mt-5 max-w-3xl border-l-2 border-[#4EC98F] bg-[#141210] p-4"><div className="flex items-center justify-between"><b className="text-sm">Your history here</b><span className="text-xs font-black text-[#4EC98F]">{detail.yourHistory.showCount} {detail.yourHistory.showCount === 1 ? "show" : "shows"}</span></div><p className="font-display mt-2 text-lg leading-7 text-[#F5F1E8]">{describeVenueHistory(detail.yourHistory)}</p></section>}<p className="mt-5 max-w-3xl text-sm leading-6 text-[#C9C1B4]">{venue.description}</p><div className="mt-5 flex gap-3">{venue.website && <a className="flex items-center gap-2 border border-[#2A2521] px-4 py-3 text-sm" href={venue.website} rel="noreferrer" target="_blank">Website <ExternalLink className="h-4 w-4" /></a>}{venue.jambaseUrl && <a className="flex items-center gap-2 border border-[#2A2521] px-4 py-3 text-sm" href={venue.jambaseUrl} rel="noreferrer" target="_blank">JamBase <ExternalLink className="h-4 w-4" /></a>}</div></section><ShowRail eyebrow={`${upcoming.length} on the calendar`} openShow={openShow} shows={upcoming} title="Upcoming shows" /><ShowRail dimUnattended eyebrow="Yours vivid — tap a faded night to reclaim it" openShow={openShow} shows={past} title="Past shows" /><section className="mt-9"><SectionTitle eyebrow="Verified attendees" title="Venue reviews" /><div className="mt-4 divide-y divide-white/10">{detail.reviews.length ? detail.reviews.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="No venue reviews yet." />}</div></section></div>;
}
