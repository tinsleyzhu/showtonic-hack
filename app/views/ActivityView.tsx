"use client";

import { Bookmark, Heart, Star } from "lucide-react";
import { Avatar, EmptyLine, formatDate, PageTitle, SectionTitle, type LiveState } from "./shared";

type FeedEvent = LiveState["activityFeed"][number];

// v1.5 people surface (design 21): friends' activity feed + taste matches +
// the density-gated leaderboard. Reachable only when it has content
// (empty-room rule).
export function ActivityView({
  feed,
  activityScope,
  onActivityScope,
  onToggleLike,
  onOpenShow,
  onOpenMatch,
  onWatchlist,
  leaderboard,
  matches,
  scope,
  onScope,
}: {
  feed: LiveState["activityFeed"];
  activityScope: "friends" | "you";
  onActivityScope: (scope: "friends" | "you") => void;
  onToggleLike: (logId: string) => Promise<unknown>;
  onOpenShow: (id: string) => void;
  onOpenMatch: (userId: string) => void;
  onWatchlist: (showId: string) => Promise<unknown>;
  leaderboard: LiveState["leaderboard"];
  matches: LiveState["tasteMatches"];
  scope: "city" | "artist" | "venue";
  onScope: (scope: "city" | "artist" | "venue") => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageTitle eyebrow="Your live music circle" title="Activity" />

      <div className="mt-6 grid grid-cols-2 border border-[#2A2521] p-1">
        {([["friends", "Friends"], ["you", "You"]] as const).map(([value, label]) => (
          <button className={`px-3 py-2 text-xs font-bold ${activityScope === value ? "bg-[#FF7A50] text-black" : "text-[#8A8177]"}`} key={value} onClick={() => onActivityScope(value)} type="button">{label}</button>
        ))}
      </div>

      <section className="mt-6">
        <SectionTitle eyebrow={`${feed.length} updates`} title="This week" />
        {feed.length ? (
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {feed.map((event) => (
              <FeedRow event={event} key={event.id} onOpenShow={onOpenShow} onToggleLike={onToggleLike} onWatchlist={onWatchlist} />
            ))}
          </div>
        ) : (
          <EmptyLine text={activityScope === "you" ? "Log a show and your activity lands here." : "When friends log, rate, or plan shows, it shows up here."} />
        )}
      </section>

      {matches.length > 0 && (
        <section className="mt-9 border-t border-white/10 pt-6">
          <SectionTitle eyebrow="Receipts, not just a percentage" title="Most similar to you" />
          <div className="mt-4 space-y-3">
            {matches.map((match) => (
              <button className="flex w-full items-center gap-3 border border-[#2A2521] bg-[#141210] p-4 text-left" key={match.userId} onClick={() => onOpenMatch(match.userId)} type="button">
                <Avatar color={match.avatarColor} name={match.handle} />
                <div className="min-w-0 flex-1">
                  <b>@{match.handle}</b>
                  <p className="mt-1 truncate text-xs text-[#8A8177]">{match.sharedArtistNames.length ? `Both saw ${match.sharedArtistNames.slice(0, 2).join(", ")}` : `${match.sharedShowCount} shared shows`}</p>
                </div>
                <strong className="font-display text-2xl text-[#4EC98F]">{Math.min(Math.round(match.score * 100), 99)}%</strong>
              </button>
            ))}
          </div>
        </section>
      )}

      {leaderboard && leaderboard.rows.length > 0 && (
        <section className="mt-9 border-t border-white/10 pt-6">
          <div className="flex items-end justify-between gap-3">
            <SectionTitle eyebrow={leaderboard.label} title="Most active" />
            <div className="flex gap-1">
              {(["city", "artist", "venue"] as const).map((item) => (
                <button className={`px-2 py-1 text-[10px] font-bold capitalize ${scope === item ? "bg-[#2A2521] text-[#F5F1E8]" : "text-[#8A8177]"}`} key={item} onClick={() => onScope(item)} type="button">{item}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 divide-y divide-white/10">
            {leaderboard.rows.map((row, index) => (
              <div className="grid grid-cols-[32px_44px_1fr_auto] items-center gap-3 py-4" key={row.userId}>
                <strong className="text-xl text-[#6B6258]">{index + 1}</strong>
                <Avatar color={row.avatarColor} name={row.handle} />
                <div><b>@{row.handle}</b><p className="text-xs text-[#8A8177]">{row.note}</p></div>
                <b className="text-sm text-[#4EC98F]">{row.value}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FeedRow({ event, onOpenShow, onToggleLike, onWatchlist }: { event: FeedEvent; onOpenShow: (id: string) => void; onToggleLike: (logId: string) => Promise<unknown>; onWatchlist: (showId: string) => Promise<unknown> }) {
  const artist = event.show.artistNames?.[0] ?? event.show.title;
  return (
    <div className="py-4">
      <div className="flex items-center gap-3">
        <Avatar color={event.user?.avatarColor} name={event.user?.handle ?? "showgoer"} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <b>@{event.user?.handle ?? "showgoer"}</b>{" "}
            {event.kind === "logged" ? "logged" : `is ${"status" in event && event.status === "interested" ? "interested in" : "going to"}`}{" "}
            <button className="font-black text-[#F5F1E8] underline decoration-[#2A2521] underline-offset-4" onClick={() => onOpenShow(String(event.showId))} type="button">{artist}</button>
            {event.kind === "logged" && event.rating > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-black text-[#4EC98F]"><Star className="h-3 w-3 fill-current" /> {event.rating}</span>
            )}
          </p>
          <p className="mt-1 text-xs text-[#8A8177]">{event.show.venueName} · {formatDate(event.show.date)}</p>
        </div>
      </div>
      {event.kind === "logged" && event.reviewExcerpt && (
        <p className="font-display mt-3 border-l-2 border-[#2A2521] pl-3 text-base leading-7 text-[#C9C1B4]">&ldquo;{event.reviewExcerpt}&rdquo;</p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-[#8A8177]">
        {event.kind === "logged" && event.logId ? (
          <button className={`flex items-center gap-1 font-black ${event.likedByMe ? "text-[#4EC98F]" : ""}`} onClick={() => void onToggleLike(String(event.logId))} type="button">
            <Heart className={`h-4 w-4 ${event.likedByMe ? "fill-current" : ""}`} /> {event.likeCount || ""}
          </button>
        ) : <span />}
        <button className="flex items-center gap-1 font-black text-[#4EC98F]" onClick={() => void onWatchlist(String(event.showId))} type="button">
          <Bookmark className="h-4 w-4" /> Save show
        </button>
      </div>
    </div>
  );
}
