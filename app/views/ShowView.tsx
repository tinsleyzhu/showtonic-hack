"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, ExternalLink, MapPin, Music2, Star, Ticket, X } from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";
import { vibes } from "../data";
import { resolveShowImage } from "../liveData.js";
import {
  adaptShow,
  collapseFestivalShows,
  DetailSkeleton,
  EmptyLine,
  InlinePanel,
  RatingStars,
  ReviewRow,
  SectionTitle,
  shareOrCopy,
  ShowRail,
  Stat,
  StatusPanel,
  todayIso,
  tracksFor,
  type Attendance,
  type LiveState,
  type Show,
  posterFallback,
} from "./shared";

export function ShowView({
  detail,
  onBack,
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
  moments,
  posterIndex,
  onPosterIndex,
  onAddMoments,
  onToggleWatchlist,
  selectedSong,
  setSelectedSong,
  submitLog,
  currentUserId,
}: {
  detail: LiveState["showDetail"];
  onBack: () => void;
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
  moments: { file: File; url: string }[];
  posterIndex: number;
  onPosterIndex: (index: number) => void;
  onAddMoments: (files: FileList | null) => void;
  onToggleWatchlist: (showId: string) => Promise<unknown>;
  selectedSong: string;
  setSelectedSong: (song: string) => void;
  submitLog: () => Promise<void>;
  currentUserId?: Id<"users">;
}) {
  // Declared before the guards below: a hook after a conditional return is a
  // rules-of-hooks violation the moment `detail` flips.
  const [watchlistBusy, setWatchlistBusy] = useState(false);

  async function toggleWatchlist() {
    if (watchlistBusy) return;
    setWatchlistBusy(true);
    try {
      await onToggleWatchlist(show.id);
    } finally {
      setWatchlistBusy(false);
    }
  }

  if (detail === undefined) return <DetailSkeleton label="Loading this show" />;
  if (!detail) return <InlinePanel actionLabel="Back to Discover" detail="It may have been removed from the catalog since you opened it." onAction={onBack} title="We could not open this show" />;

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
  const yourReview = detail.logs.find((log) => log.userId === currentUserId);
  const friendReviews = detail.logs.filter((log) => log.userId !== currentUserId);

  return (
    <div>
      <section className="relative min-h-[54vh] overflow-hidden">
        <img onError={posterFallback} alt={show.title} className="absolute inset-0 h-full w-full object-cover" src={show.image} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#0A0908]/65 to-[#0A0908]" />
        <button className="absolute left-4 top-4 z-10 flex items-center gap-2 border border-white/30 bg-[#0A0908]/85 px-4 py-3 text-sm font-black sm:left-6" onClick={onBack} type="button"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="relative mx-auto flex min-h-[54vh] max-w-6xl flex-col justify-end px-4 pb-8 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF7A50]">{isFestival ? "Festival" : isPast ? "Past show" : "Upcoming show"} · {show.day} · {show.time}</p>
          <h1 className="font-display mt-3 max-w-4xl text-5xl leading-none sm:text-7xl">{show.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button className="flex w-fit items-center gap-2 text-sm text-[#C9C1B4]" onClick={() => show.venueId && openVenue(show.venueId)} type="button"><MapPin className="h-4 w-4" /> {show.venueName}, {show.city}</button>
            {isPast && detail.ratingCount > 0 && (
              <span className="flex items-center gap-1 text-sm font-black text-[#4EC98F]">
                <Star className="h-4 w-4 fill-current" /> {detail.rating.toFixed(1)} · {detail.ratingCount} verified
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div>
          <section className="grid grid-cols-3 border border-[#2A2521] bg-[#141210] p-5 text-center">
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

          {isPast ? <button className="mt-5 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black" data-log-show-fallback onClick={() => setLogOpen(true)} type="button">{detail.attendanceStatus === "logged" ? "Edit your show log" : "Log this show"}</button> : <div className="mt-5 grid grid-cols-3 gap-2">
            {(["interested", "going"] as Attendance[]).map((status) => <button aria-pressed={detail.attendanceStatus === status} className={`border px-3 py-3 text-xs font-black capitalize disabled:opacity-60 ${detail.attendanceStatus === status ? "border-[#FF7A50] bg-[#FF7A50] text-black" : "border-[#2A2521] text-[#C9C1B4]"}`} disabled={operation !== "idle"} key={status} onClick={() => setAttendance(status)} type="button">{operation === "saving" ? "Saving…" : status}</button>)}
            <button aria-pressed={detail.isWatchlisted} className={`border px-3 py-3 text-xs font-black disabled:opacity-60 ${detail.isWatchlisted ? "border-[#4EC98F] text-[#4EC98F]" : "border-[#2A2521] text-[#C9C1B4]"}`} disabled={watchlistBusy} onClick={() => void toggleWatchlist()} type="button">{watchlistBusy ? "Saving…" : detail.isWatchlisted ? "Watchlisted" : "Watchlist"}</button>
          </div>}
          {error && <p aria-live="assertive" className="surface-settle mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200" role="alert">{error}</p>}

          <section className="mt-9">
            <SectionTitle eyebrow={isFestival ? `${detail.artists.length} artists on one festival page` : "Artist and song previews"} title={isFestival ? "Festival lineup" : "Lineup"} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {detail.artists.map((lineupArtist) => <article className="border border-[#2A2521] bg-[#141210] p-4" key={lineupArtist._id}>
                <button className="flex w-full items-center gap-3 text-left" onClick={() => openArtist(lineupArtist._id)} type="button">
                  <img onError={posterFallback} alt={lineupArtist.name} className="h-14 w-14 object-cover" src={resolveShowImage(lineupArtist.image, [lineupArtist.name])} />
                  <span className="min-w-0"><b className="block truncate">{lineupArtist.name}</b><small className="text-[#8A8177]">{lineupArtist.genres.slice(0, 2).join(" · ") || "Live artist"}</small></span>
                </button>
                <div className="mt-3 space-y-2">{tracksFor(lineupArtist.name).slice(0, 2).map((track) => <button className={`flex w-full items-center gap-2 border px-3 py-2 text-left text-xs ${selectedSong === track ? "border-[#FF7A50] text-[#FF7A50]" : "border-[#2A2521] text-[#C9C1B4]"}`} key={track} onClick={() => setSelectedSong(track)} type="button"><Music2 className="h-3 w-3" /> Preview {track}</button>)}</div>
              </article>)}
            </div>
          </section>

          {isPast ? <>
            <section className="mt-9">
              <SectionTitle eyebrow="Your rating, review, and poster for this night" title="Your memory" />
              <div className="mt-4 border-y border-white/10">
                {yourReview ? <ReviewRow log={yourReview} /> : <button className="flex w-full items-center justify-between py-5 text-left text-sm text-[#C9C1B4]" onClick={() => setLogOpen(true)} type="button"><span>Log this show to add your rating and review.</span><span className="font-black text-[#FF7A50]">Add review</span></button>}
              </div>
            </section>
            <section className="mt-9">
              <SectionTitle eyebrow="Verified attendees you may know" title="Friends' reviews" />
              <div className="mt-4 divide-y divide-white/10 border-y border-white/10">{friendReviews.length ? friendReviews.map((log) => <ReviewRow key={log._id} log={log} />) : <EmptyLine text="No friends have reviewed this show yet." />}</div>
            </section>
            {yourReview && (
              <section className="mt-9">
                <SectionTitle eyebrow="Share the night — handle and stub code included" title="Your stub" />
                <StubCard
                  artistLine={show.artistNames?.join(" + ") || show.title}
                  city={show.city}
                  date={show.date}
                  handle={yourReview.user?.handle ?? "showgoer"}
                  rating={yourReview.rating}
                  stubCode={String(yourReview._id).slice(-6).toUpperCase()}
                  venueName={show.venueName}
                />
              </section>
            )}
            <section className="mt-9">
              <SectionTitle eyebrow="Convex Storage" title="Poster moments" />
              {detail.media.length ? <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{detail.media.map((item) => item.url ? <img onError={posterFallback} alt={item.caption ?? show.title} className="aspect-square w-full object-cover" key={item._id} src={item.url} /> : null)}</div> : <EmptyLine text="No uploaded posters yet." />}
            </section>
            <ShowRail eyebrow="Based on this show" openShow={openShow} shows={collapseFestivalShows(detail.recommendedShows.map((item) => adaptShow(item)))} title="What to see next" />
          </> : <section className="mt-9">
            <SectionTitle eyebrow="Friends and second-degree showgoers" title="Who is planning to go" />
            {planningAttendees.length ? <div className="mt-4 divide-y divide-white/10 border-y border-white/10">{planningAttendees.map((attendee) => <div className="flex items-center gap-3 py-4" key={attendee._id}><span aria-label={attendee.user?.handle ?? "showgoer"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#141210] text-xs font-black text-black" style={{ backgroundColor: attendee.user?.avatarColor ?? "#FF7A50" }}>{(attendee.user?.handle ?? "showgoer").slice(0, 1).toUpperCase()}</span><div className="flex-1"><b>@{attendee.user?.handle ?? "showgoer"}</b><p className="text-xs capitalize text-[#8A8177]">{attendee.status}</p></div></div>)}</div> : <EmptyLine text="Be the first friend to mark interest." />}
          </section>}
        </div>

        <aside className="space-y-5">
          {detail.venue && <button className="w-full border border-[#2A2521] bg-[#141210] p-5 text-left" onClick={() => openVenue(detail.venue!._id)} type="button"><p className="text-xs font-black uppercase text-[#FF7A50]">Venue {isPast ? "archive" : "signal"}</p><h2 className="font-display mt-2 text-2xl">{detail.venue.name}</h2><p className="mt-2 text-sm text-[#8A8177]">{detail.venue.city}, {detail.venue.region}</p>{detail.venueSignal && detail.venueSignal.ratingCount > 0 && <p className="mt-3 border-l-2 border-[#4EC98F] pl-3 text-sm"><b className="text-[#4EC98F]">{detail.venueSignal.rating.toFixed(1)} venue rating</b> <span className="text-[#8A8177]">· {detail.venueSignal.ratingCount} verified</span>{detail.venueSignal.note && <span className="mt-1 block leading-6 text-[#C9C1B4]">{detail.venueSignal.note}</span>}</p>}<p className="mt-4 text-sm leading-6 text-[#C9C1B4]">{detail.venue.description || "Open the venue page for its past and upcoming calendar."}</p></button>}
          {show.jambaseUrl && <a className="flex items-center justify-between border border-[#2A2521] p-4 text-sm" href={show.jambaseUrl} rel="noreferrer" target="_blank">JamBase event data <ExternalLink className="h-4 w-4" /></a>}
          {show.ticketUrl && <a className="flex items-center justify-between bg-[#FF7A50] p-4 text-sm font-black text-black" href={show.ticketUrl} rel="noreferrer" target="_blank">Tickets <Ticket className="h-4 w-4" /></a>}
          {!isPast && artist && <button className="w-full border border-[#2A2521] px-5 py-4 text-sm font-black text-[#FF7A50]" onClick={() => openArtist(artist._id)} type="button">Open artist profile</button>}
        </aside>
      </div>

      <LogSheet
        caption={caption}
        error={error}
        moments={moments}
        onAddMoments={onAddMoments}
        onClose={() => setLogOpen(false)}
        onPosterIndex={onPosterIndex}
        open={isPast && logOpen}
        operation={operation}
        posterIndex={posterIndex}
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
    </div>
  );
}

// Per-show ticket-stub share card (FEATURES §9): one visual grammar, always
// carrying handle + stub code.
function StubCard({ artistLine, venueName, city, date, rating, handle, stubCode }: { artistLine: string; venueName?: string; city?: string; date: string; rating: number; handle: string; stubCode: string }) {
  const dateLabel = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  async function share() {
    setShareState(await shareOrCopy({
      title: `${artistLine} — Showtonic stub`,
      text: `I was at ${artistLine}${venueName ? ` at ${venueName}` : ""} · ${dateLabel}${rating > 0 ? ` · rated ${rating}/5` : ""} — logged by @${handle} on Showtonic · stub ${stubCode}`,
    }));
  }
  return (
    <div className="mt-4 max-w-md">
      <div className="grid grid-cols-[1fr_96px] border border-[#2A2521] bg-[#141210]">
        <div className="p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#FF7A50]">Showtonic · verified night</p>
          <h3 className="font-display mt-2 text-2xl leading-tight">{artistLine}</h3>
          <p className="mt-2 font-mono text-xs text-[#8A8177]">{venueName}{city ? ` · ${city}` : ""}</p>
          <p className="mt-1 font-mono text-xs text-[#8A8177]">{dateLabel}</p>
          {rating > 0 && <p className="mt-3 flex items-center gap-1 text-sm font-black text-[#4EC98F]"><Star className="h-4 w-4 fill-current" /> {rating.toFixed(1)}</p>}
        </div>
        <div className="flex flex-col items-center justify-between border-l border-dashed border-[#6B6258] p-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#8A8177] [writing-mode:vertical-rl]">@{handle}</span>
          <span className="font-mono text-xs font-black text-[#FF7A50]">{stubCode}</span>
        </div>
      </div>
      <button className="mt-3 w-full border border-[#2A2521] px-4 py-3 text-sm font-black text-[#4EC98F]" onClick={() => void share()} type="button">
        Share this stub
      </button>
      {shareState !== "idle" && (
        <p aria-live="polite" className={`mt-2 text-xs ${shareState === "failed" ? "text-red-200" : "text-[#8A8177]"}`} role="status">
          {shareState === "copied" && "Copied to your clipboard — paste it anywhere."}
          {shareState === "shared" && "Sent to your share sheet."}
          {shareState === "failed" && "Could not share or copy. Select the stub text above and copy it by hand."}
        </p>
      )}
    </div>
  );
}

export function LogSheet({ show, rating, setRating, selectedVibes, toggleVibe, review, setReview, caption, setCaption, moments, posterIndex, onPosterIndex, onAddMoments, tracks, selectedSong, setSelectedSong, submit, onClose, open, operation, error }: {
  show: Show; rating: number; setRating: (value: number) => void; selectedVibes: string[]; toggleVibe: (vibe: string) => void; review: string; setReview: (value: string) => void; caption: string; setCaption: (value: string) => void; moments: { file: File; url: string }[]; posterIndex: number; onPosterIndex: (index: number) => void; onAddMoments: (files: FileList | null) => void; tracks: string[]; selectedSong: string; setSelectedSong: (song: string) => void; submit: () => Promise<void>; onClose: () => void; open: boolean; operation: LiveState["operation"]; error: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      const previousFocus = previousFocusRef.current;
      const fallback = document.querySelector<HTMLElement>("[data-log-show-fallback]");
      (previousFocus?.isConnected ? previousFocus : fallback)?.focus();
    };
  }, [open]);

  return (
    <dialog
      aria-labelledby="show-log-dialog-title"
      aria-modal="true"
      className="log-dialog fixed inset-0 m-auto max-h-[calc(100vh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto border border-[#2A2521] bg-[#141210] p-0 text-[#F5F1E8] shadow-2xl sm:max-h-[calc(100vh-4rem)]"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <section>
        <header className="flex items-start justify-between border-b border-white/10 p-5"><div><p className="text-xs font-black uppercase text-[#FF7A50]">Verified show log</p><h2 className="font-display mt-1 text-2xl" id="show-log-dialog-title">Log {show.title}</h2></div><button aria-label="Close logger" onClick={onClose} ref={closeButtonRef} type="button"><X /></button></header>
        <div className="space-y-6 p-5">
          <div><p className="mb-2 text-xs font-black uppercase text-[#FF7A50]">Rate the show</p><RatingStars interactive onChange={setRating} value={rating} /></div>
          <div><p className="mb-2 text-xs font-black uppercase text-[#FF7A50]">What did it feel like?</p><div className="flex flex-wrap gap-2">{vibes.map((vibe) => <button className={`border px-3 py-2 text-xs ${selectedVibes.includes(vibe) ? "border-[#4EC98F] bg-[#15251C] text-[#BFE8D2]" : "border-[#2A2521] text-[#C9C1B4]"}`} key={vibe} onClick={() => toggleVibe(vibe)} type="button">{vibe}</button>)}</div></div>
          <label className="block"><span className="mb-2 block text-xs font-black uppercase text-[#FF7A50]">One line to remember</span><textarea className="min-h-24 w-full border border-[#2A2521] bg-[#0A0908] p-3 text-sm outline-none focus:border-[#FF7A50]" onChange={(event) => setReview(event.target.value)} placeholder={show.memoryPrompt} value={review} /></label>
          {/* Your moments — local-first; tap one to make it the memory poster (design 18) */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase text-[#FF7A50]">Your moments</p>
              {moments.length > 0 && <small className="text-[#8A8177]">{moments.length} on this device</small>}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {moments.map((moment, index) => (
                <button
                  aria-label={index === posterIndex ? "Memory poster" : `Make moment ${index + 1} the poster`}
                  className={`relative aspect-square overflow-hidden border-2 ${index === posterIndex ? "border-[#4EC98F]" : "border-transparent"}`}
                  key={moment.url}
                  onClick={() => onPosterIndex(index)}
                  type="button"
                >
                  <img onError={posterFallback} alt="" className="h-full w-full object-cover" src={moment.url} />
                  {index === posterIndex && <span className="absolute bottom-0 inset-x-0 bg-[#4EC98F] py-0.5 text-center text-[9px] font-black uppercase text-black">Poster</span>}
                </button>
              ))}
              <label className="flex aspect-square cursor-pointer items-center justify-center border border-dashed border-[#6B6258] bg-[#0A0908]">
                <span className="flex flex-col items-center gap-1 text-[10px] text-[#8A8177]"><Camera className="h-4 w-4" /> Add</span>
                <input accept="image/*,video/*" className="sr-only" multiple onChange={(event) => onAddMoments(event.target.files)} type="file" />
              </label>
            </div>
            <p className="mt-2 text-xs text-[#8A8177]">Moments stay on this device. Only your chosen poster uploads.</p>
          </div>
          {/* Memory poster — 1 photo + caption + 1 song, the tile for this night */}
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase text-[#FF7A50]">Memory poster</p>
              <small className="text-[#8A8177]">Becomes the tile in your diary</small>
            </div>
            <div className="mt-2 space-y-3">
              <input className="w-full border border-[#2A2521] bg-[#0A0908] p-3 text-sm outline-none" onChange={(event) => setCaption(event.target.value)} placeholder="One-line caption" value={caption} />
              {tracks.map((track) => <button className={`flex w-full items-center gap-2 border p-2 text-left text-sm ${selectedSong === track ? "border-[#FF7A50] text-[#FF7A50]" : "border-[#2A2521]"}`} key={track} onClick={() => setSelectedSong(track)} type="button"><Music2 className="h-4 w-4" /> {track}{selectedSong === track && <Check className="ml-auto h-4 w-4" />}</button>)}
            </div>
          </div>
          {error && <p aria-live="assertive" className="border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200" role="alert">{error}</p>}
          <button className="w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-50" disabled={operation !== "idle"} onClick={submit} type="button">{operation === "saving" ? "Saving log..." : operation === "uploading" ? "Uploading poster..." : "Save show"}</button>
        </div>
      </section>
    </dialog>
  );
}
