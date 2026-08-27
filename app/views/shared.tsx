"use client";

import type { ReactNode, SyntheticEvent } from "react";
import { ArrowLeft, Star } from "lucide-react";
import type { Show } from "../data";
import { toShow } from "../liveData.js";
import type { useShowtonic } from "../useShowtonic";

export type View =
  | "briefing"
  | "discover"
  | "artists"
  | "venues"
  | "show"
  | "leaderboard"
  | "profile"
  | "artist"
  | "venue"
  | "tasteMatch";
export type Attendance = "interested" | "going" | "logged";
export type CatalogMode = "upcoming" | "past";
export type DiaryFilter = "Wall" | "Calendar" | "Artist" | "Venue" | "City" | "Genre" | "Rating";

// Low-N rule (FEATURES.md): under 5 logged shows, show potential, not stats.
export const LOW_N_THRESHOLD = 5;
export type LiveState = ReturnType<typeof useShowtonic>;
export type ShowDetailPayload = NonNullable<LiveState["showDetail"]>;
export type ArtistDetailPayload = NonNullable<LiveState["artistDetail"]>;
export type VenueDetailPayload = NonNullable<LiveState["venueDetail"]>;
export type { Show };

export const tracksByArtist: Record<string, string[]> = {
  "Charli XCX": ["360", "Apple", "Von dutch"],
  "RÜFÜS DU SOL": ["Innerbloom", "Next to Me", "On My Knees"],
  Doechii: ["Nissan Altima", "Denial Is a River", "Alter Ego"],
  "The Strokes": ["Last Nite", "Someday", "Reptilia"],
  "Vampire Weekend": ["A-Punk", "Harmony Hall", "Capricorn"],
  MUNA: ["Silk Chiffon", "Number One Fan", "Anything But Me"],
  "Jamie xx": ["Loud Places", "Gosh", "All Under One Roof Raving"],
};

export function adaptShow(value: object) {
  return toShow(value as Record<string, unknown>);
}

export function tracksFor(name?: string) {
  // No fallback: fake track chips ("Festival favorite", "Live preview") on
  // every unknown artist read as broken buttons. An artist we have no tracks
  // for shows no track row at all.
  return tracksByArtist[name ?? ""] ?? [];
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function collapseFestivalShows(values: Show[]) {
  const parents = new Map<string, Show>();
  for (const show of values) {
    const isFestivalRecord =
      /festival|outside lands/i.test(show.title) || (show.artistNames?.length ?? 0) >= 5;
    if (!show.festivalId || !isFestivalRecord || (show.artistNames?.length ?? 0) < 2) continue;
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

export const cityCoordinates: Record<string, [number, number]> = {
  "San Francisco": [37.7749, -122.4194],
  Oakland: [37.8044, -122.2712],
  "San Jose": [37.3382, -121.8863],
  "Los Angeles": [34.0522, -118.2437],
  "New York": [40.7128, -74.006],
};

export function nearestHomeCity(latitude: number, longitude: number, available: string[]) {
  const candidates = available.filter((city) => cityCoordinates[city]);
  return (candidates.length ? candidates : ["San Francisco"]).reduce((closest, city) => {
    const [lat, lng] = cityCoordinates[city];
    const [closestLat, closestLng] = cityCoordinates[closest];
    const distance = (lat - latitude) ** 2 + (lng - longitude) ** 2;
    const closestDistance = (closestLat - latitude) ** 2 + (closestLng - longitude) ** 2;
    return distance < closestDistance ? city : closest;
  });
}

export function ShowRail({ title, eyebrow, shows, openShow, reasonFor, dimUnattended = false }: { title: string; eyebrow: string; shows: Show[]; openShow: (id: string) => void; reasonFor?: (show: Show) => string; dimUnattended?: boolean }) {
  const visibleShows = shows.slice(0, 24);
  return <section className="mt-10"><SectionTitle eyebrow={eyebrow} title={title} />{visibleShows.length ? <div className="hide-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2">{visibleShows.map((show) => <ShowCard dimUnattended={dimUnattended} key={show.id} openShow={openShow} reason={reasonFor?.(show)} show={show} />)}</div> : <EmptyLine text="No shows in this shelf yet." />}</section>;
}

export function ShowCard({ show, openShow, reason, dimUnattended = false }: { show: Show; openShow: (id: string) => void; reason?: string; dimUnattended?: boolean }) {
  const badge = show.ratingCount ? `${show.rating?.toFixed(1)} ★` : show.isJamBase ? "JAMBASE" : "NEW";
  const attended = show.attendanceStatus === "logged";
  // Entity pages render your attended shows vivid and the rest as faded ghost
  // tiles that invite reclaiming (design 23/24).
  const ghost = dimUnattended && !attended;
  // Every recommendation carries a reason string (FEATURES §4); raw activity
  // counts are the fallback, never a black box.
  const footnote = ghost ? "I was there →" : reason || `${show.loggedCount ?? 0} logged · ${show.goingCount ?? 0} going`;
  return <button className="w-44 shrink-0 overflow-hidden border border-[#2A2521] bg-[#141210] text-left sm:w-52" onClick={() => openShow(show.id)} type="button"><div className="relative aspect-[2/3]"><img onError={posterFallback} alt={show.title} className={`h-full w-full object-cover ${ghost ? "opacity-40 saturate-50" : ""}`} src={show.image} /><span className="absolute right-2 top-2 bg-[#0A0908]/90 px-2 py-1 text-xs font-black text-[#4EC98F]">{badge}</span>{attended && <span className="absolute left-2 top-2 bg-[#4EC98F] px-2 py-1 text-[9px] font-black uppercase text-black">In your diary</span>}</div><div className="p-3"><b className="block truncate">{show.artistNames?.join(" + ") || show.title}</b><p className="mt-1 flex items-baseline text-xs text-[#8A8177]"><span className="truncate">{formatDate(show.date)} · {show.venueName}</span>{show.time && show.time !== "Time TBA" && <span className="shrink-0">{` · ${show.time}`}</span>}</p><p className={`mt-2 truncate text-[10px] font-black ${ghost || reason ? "text-[#4EC98F]" : "uppercase text-[#FF7A50]"}`}>{footnote}</p></div></button>;
}

export function ReviewRow({ log }: { log: ShowDetailPayload["logs"][number] | ArtistDetailPayload["reviews"][number] | VenueDetailPayload["reviews"][number] }) {
  return <div className="flex gap-3 py-4"><Avatar color={log.user?.avatarColor} name={log.user?.handle ?? "showgoer"} /><div className="flex-1"><div className="flex items-center justify-between"><b className="text-sm">@{log.user?.handle ?? "showgoer"}</b><span className="flex items-center gap-1 text-xs text-[#4EC98F]"><Star className="h-3 w-3 fill-current" /> {log.rating}</span></div><p className="mt-2 text-sm text-[#C9C1B4]">{log.note || "Verified attendance"}</p>{log.vibes.length > 0 && <p className="mt-2 text-[10px] uppercase tracking-wide text-[#8A8177]">{log.vibes.join(" · ")}</p>}</div></div>;
}

// Read-only stars are one image with one label, not five disabled buttons —
// disabled controls are five pieces of noise where a screen reader needs one
// fact. Interactive stars announce which one is actually chosen (aria-pressed
// on the exact star), because "3 stars, pressed" on stars one through three
// tells you the rating is somewhere between one and three.
export function RatingStars({ value, interactive = false, onChange }: { value: number; interactive?: boolean; onChange?: (value: number) => void }) {
  if (!interactive) {
    return <span aria-label={value > 0 ? `Rated ${value} out of 5` : "Not rated"} className="flex gap-1" role="img">{[1, 2, 3, 4, 5].map((star) => <Star aria-hidden className={`h-7 w-7 ${value >= star ? "fill-[#4EC98F] text-[#4EC98F]" : "text-[#6B6258]"}`} key={star} />)}</span>;
  }
  return <div aria-label="Rate this show out of 5" className="flex gap-1" role="group">{[1, 2, 3, 4, 5].map((star) => <button aria-label={`Rate ${star} out of 5`} aria-pressed={value === star} className="cursor-pointer" key={star} onClick={() => onChange?.(star)} type="button"><Star className={`h-7 w-7 transition-transform ${value >= star ? "fill-[#4EC98F] text-[#4EC98F]" : "text-[#6B6258]"} ${value === star ? "scale-110" : ""}`} /></button>)}</div>;
}

export function StatusPanel({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#0A0908] px-6 text-[#F5F1E8]"><section aria-live="polite" className="max-w-xl border border-[#2A2521] bg-[#141210] p-8" role="status"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF7A50]">{loading ? "Live sync" : "Showtonic"}</p><h1 className="font-display mt-3 text-3xl">{title}</h1><p className="mt-4 leading-7 text-[#C9C1B4]">{detail}</p>{loading && <div className="mt-6 h-1 overflow-hidden bg-[#2A2521]"><div className="h-full w-1/2 animate-pulse bg-[#FF7A50]" /></div>}</section></main>;
}

// The "we could not load this" case, rendered INSIDE the app layout. StatusPanel
// emits its own <main class="min-h-screen">, which is right for the boot screens
// in page.tsx and wrong here — nested inside the page's own <main> it is both a
// duplicate landmark and a full viewport of empty space that shoves the content
// you were reading off screen.
export function InlinePanel({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6"><section aria-live="polite" className="border border-[#2A2521] bg-[#141210] p-8" role="status"><h1 className="font-display text-2xl">{title}</h1><p className="mt-3 leading-7 text-[#C9C1B4]">{detail}</p>{actionLabel && onAction && <button className="mt-6 bg-[#FF7A50] px-5 py-3 text-sm font-black text-black" onClick={onAction} type="button">{actionLabel}</button>}</section></div>;
}

export function SectionTitle({ title, eyebrow, id }: { title: string; eyebrow: string; id?: string }) {
  // `id` exists so a wrapping <section aria-labelledby=…> can actually resolve
  // to this heading — a reference to a missing id names the landmark nothing.
  return <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#8A8177]">{eyebrow}</p><h2 className="font-display mt-1 text-2xl" id={id}>{title}</h2></div>;
}

export function PageTitle({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div><p className="text-sm text-[#8A8177]">{eyebrow}</p><h1 className="font-display mt-1 text-3xl">{title}</h1></div>;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-white/10 px-2 last:border-r-0"><strong className="font-display block text-2xl sm:text-3xl">{value}</strong><span className="mt-1 block text-[10px] uppercase text-[#8A8177]">{label}</span></div>;
}

// Every poster in this product is a hotlink to a host we do not control, and
// roughly fifty of them load per screen. Until now nothing caught a dead one:
// there was no `onError` anywhere in the app, so a URL that 404s renders as alt
// text on a grey box. Four are broken on the demo account's diary right now,
// and one upstream blip during a demo would fill the app with them.
//
// The fallback is an inline SVG data URI ON PURPOSE. `DEFAULT_SHOW_IMAGE` is
// itself an unsplash.com hotlink, so falling back to it fails in exactly the
// case this exists for — the network or a third-party host being the problem.
// A data URI cannot 404, cannot be rate-limited, and costs no request. Same
// rule the recap export already follows: nothing loaded from anywhere.
export const POSTER_FALLBACK =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 180" preserveAspectRatio="xMidYMid slice">' +
      '<rect width="120" height="180" fill="#141210"/>' +
      '<rect x="0.5" y="0.5" width="119" height="179" fill="none" stroke="#2A2521"/>' +
      '<path d="M52 116V70l26-7v45" fill="none" stroke="#FF7A50" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="47" cy="118" r="7" fill="#FF7A50"/><circle cx="73" cy="111" r="7" fill="#FF7A50"/>' +
      "</svg>",
  );

// Swaps a poster that failed to load for the local one. The guard is not
// decoration: without it, a fallback that itself somehow failed would fire
// `onError` again and spin forever.
//
// It guards on the CURRENT src rather than a sticky flag on purpose. A flag
// would latch: the first dead URL would set it, and a different dead URL
// rendered into the same <img> later — which React does constantly as lists
// re-render — would find the guard already tripped and stay broken.
export function posterFallback(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.src === POSTER_FALLBACK) return;
  image.src = POSTER_FALLBACK;
}

export function Avatar({ name, color }: { name: string; color?: string }) {
  return <span aria-label={name} role="img" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#141210] text-xs font-black text-black" style={{ backgroundColor: color ?? "#FF7A50" }}>{name.slice(0, 1).toUpperCase()}</span>;
}

// Both share buttons in the app called `navigator.share?.()` — on any desktop
// browser without the Web Share API the optional chain swallows the call and the
// button does nothing at all. No error, no fallback, no clue. Two dead controls
// on exactly the machine a demo runs on.
//
// AbortError is treated as success on purpose: it means the person opened the OS
// share sheet and dismissed it. Falling through to the clipboard there would
// copy something they had just declined to send.
export async function shareOrCopy(data: { title: string; text: string }): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator === "undefined") return "failed";
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(data.text);
    return "copied";
  } catch {
    return "failed";
  }
}

export function BackButton({ onClick, label = "Back to show" }: { onClick: () => void; label?: string }) {
  return <button className="flex items-center gap-2 text-sm text-[#8A8177]" onClick={onClick} type="button"><ArrowLeft className="h-4 w-4" /> {label}</button>;
}

// An empty state is either terminal ("no reviews yet" — nothing to do but wait)
// or a dead end with a way out. Passing an action turns it into the latter;
// without one the render is byte-for-byte what it always was.
export function EmptyLine({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  if (!actionLabel || !onAction) {
    return <p className="mt-4 border border-dashed border-[#2A2521] p-5 text-sm text-[#8A8177]">{text}</p>;
  }
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-dashed border-[#2A2521] p-5 text-sm text-[#8A8177]"><span>{text}</span><button className="shrink-0 border border-[#2A2521] px-4 py-2 text-xs font-black text-[#4EC98F]" onClick={onAction} type="button">{actionLabel}</button></div>;
}

// Announced status text. The app writes plenty of "saved" / "could not save"
// copy and, before this, none of it reached assistive tech at all.
export function LiveMessage({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  const error = tone === "error";
  return <p aria-live={error ? "assertive" : "polite"} className={error ? "border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200" : "text-sm text-[#C9C1B4]"} role={error ? "alert" : "status"}>{children}</p>;
}

// Loading that keeps the chrome. The app's detail views blank the whole screen
// — header and tab bar included — on the way in; these render inside the layout
// so nothing moves that should not.
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`surface-skeleton block ${className}`} />;
}

export function SkeletonRail({ label }: { label: string }) {
  return <section aria-label={label} aria-live="polite" className="mt-10" role="status">
    <Skeleton className="h-3 w-32" />
    <Skeleton className="mt-2 h-7 w-56" />
    <div className="mt-4 flex gap-3 overflow-hidden">{[0, 1, 2, 3, 4].map((index) => <span className="w-44 shrink-0 sm:w-52" key={index}><Skeleton className="aspect-[2/3] w-full" /><Skeleton className="mt-3 h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></span>)}</div>
    <span className="sr-only">{label}</span>
  </section>;
}

// A detail page mid-load: hero block, stat strip, two rails. Same silhouette as
// the real thing, so the page settles instead of jumping.
export function DetailSkeleton({ label }: { label: string }) {
  return <div aria-live="polite" role="status">
    <Skeleton className="h-[38vh] w-full" />
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-10 w-2/3" />
      <Skeleton className="mt-6 h-24 w-full" />
      <SkeletonRail label={label} />
    </div>
    <span className="sr-only">{label}</span>
  </div>;
}
