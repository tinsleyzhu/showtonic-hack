"use client";

import { Bookmark, Star } from "lucide-react";
import {
  Avatar,
  BackButton,
  DetailSkeleton,
  EmptyLine,
  InlinePanel,
  SectionTitle,
  type LiveState,
} from "./shared";
import { OverlapShareCard } from "./OverlapShareCard";

function monthYear(date: string) {
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

// Taste match detail (design 22): the receipts behind the percentage.
export function TasteMatchView({
  detail,
  onBack,
  onOpenShow,
  onWatchlist,
}: {
  detail: LiveState["tasteMatchDetail"];
  onBack: () => void;
  onOpenShow: (id: string) => void;
  onWatchlist: (showId: string) => Promise<unknown>;
}) {
  if (detail === undefined) return <DetailSkeleton label="Comparing your diaries" />;
  if (!detail) return <InlinePanel actionLabel="Back to Activity" detail="There is not enough shared history to compare yet. Pick someone else from Activity." onAction={onBack} title="No match to show" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <BackButton label="Back to Activity" onClick={onBack} />

      <section className="mt-6 flex items-center gap-4 border-b border-white/10 pb-6">
        <span className="scale-150"><Avatar color={detail.user.avatarColor} name={detail.user.handle} /></span>
        <div className="min-w-0 flex-1 pl-2">
          <h1 className="font-display text-3xl">@{detail.user.handle}</h1>
          <p className="mt-1 text-sm text-[#8A8177]">{detail.user.homeCity ? `${detail.user.homeCity} · ` : ""}{detail.showCount} shows</p>
          <p className="mt-1 text-xs font-black text-[#4EC98F]">Most similar to you nearby</p>
        </div>
      </section>

      <section className="mt-6 border border-[#2A2521] bg-[#141210] p-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#FF7A50]">Your taste overlap</p>
        <strong className="font-display mt-2 block text-6xl text-[#4EC98F]">{detail.matchPercent}%</strong>
        <p className="mt-2 text-sm leading-6 text-[#C9C1B4]">
          You&apos;ve both logged {detail.sharedArtistCount} of the same {detail.sharedArtistCount === 1 ? "artist" : "artists"}
          {detail.bothThereCount > 0 && <> and were at {detail.bothThereCount} of the same {detail.bothThereCount === 1 ? "show" : "shows"}</>}.
        </p>
        {detail.sharedArtists.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.sharedArtists.slice(0, 4).map((artist) => (
              <span className="border border-[#4EC98F]/40 bg-[#15251C] px-3 py-2 text-xs font-bold text-[#BFE8D2]" key={artist.name}>
                {artist.name}{artist.showCount > 1 ? ` · ${artist.showCount} shows` : ""}
              </span>
            ))}
          </div>
        )}
        <OverlapShareCard
          matchPercent={detail.matchPercent}
          sharedArtists={detail.sharedArtists}
          sharedShowCount={detail.bothThereCount}
          theirHandle={detail.user.handle}
        />
      </section>

      {detail.bothThere.length > 0 && (
        <section className="mt-8">
          <SectionTitle eyebrow={`${detail.bothThereCount} shows`} title="You were both there" />
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {detail.bothThere.map((show) => (
              <button className="flex w-full items-center gap-3 py-3 text-left" key={String(show.showId)} onClick={() => onOpenShow(String(show.showId))} type="button">
                <img alt="" className="h-11 w-11 rounded object-cover" src={show.image} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{show.artistNames[0] ?? show.title}</b>
                  <small className="text-[#8A8177]">{show.venueName} · {monthYear(show.date)}</small>
                </span>
                {show.theirRating > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-black text-[#4EC98F]"><Star className="h-3 w-3 fill-current" /> {show.theirRating}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {detail.recommendations.length > 0 ? (
        <section className="mt-8">
          <SectionTitle eyebrow="Based on their 5-star logs" title={`What @${detail.user.handle} recommends`} />
          <div className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {detail.recommendations.map((rec) => (
              <div className="flex items-center gap-3 py-3" key={String(rec.showId)}>
                <button className="min-w-0 flex-1 text-left" onClick={() => onOpenShow(String(rec.showId))} type="button">
                  <b className="block truncate text-sm">{rec.artistName}</b>
                  <small className="text-[#8A8177]">You haven&apos;t seen them yet · rated {rec.rating}</small>
                </button>
                <button aria-label={`Save ${rec.artistName} show`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2A2521]" onClick={() => void onWatchlist(String(rec.showId))} type="button">
                  <Bookmark className="h-4 w-4 text-[#4EC98F]" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <EmptyLine text="No fresh recommendations yet — their 5-star artists are already in your diary." />
      )}
    </div>
  );
}
