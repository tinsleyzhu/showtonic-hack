"use client";

import { useQuery } from "convex/react";
import { Sparkles, Star } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { resolveShowImage } from "../liveData.js";
import { RecapExport } from "./RecapExport";
import { EmptyLine, formatDate, SectionTitle, posterFallback } from "./shared";

// The recap card. The generating happens in `convex/recap.ts` and is reachable
// by the member's own agent through `generate_recap` — this screen is the same
// object rendered, not a second implementation of it.
//
// What this card deliberately does NOT have is a Post button. We cannot publish
// to Instagram on someone's behalf (their Graph API needs a business account and
// an app review, and posting public content for a person needs their consent for
// that post regardless), so the copy says "ready to post" and hands them the
// image. A button that silently did nothing would be worse than no button.

export type RecapPayload = NonNullable<
  ReturnType<typeof useQuery<typeof api.recap.build>>
>;

export function RecapCard({ userId }: { userId: Id<"users"> }) {
  const recap = useQuery(api.recap.build, { userId });

  // Empty-room rule: no logs, no card.
  if (!recap || recap.empty) return null;

  const hero = recap.photos[0]?.url ?? resolveShowImage(recap.highestRated?.image, recap.highestRated?.artistNames ? [...recap.highestRated.artistNames] : []);

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[#FF7A50]" />
        <SectionTitle eyebrow="I counted these from your logs" title="Your recap" />
      </div>

      <div className="mt-4 grid gap-0 border border-[#2A2521] bg-[#1A1713] sm:grid-cols-[minmax(0,240px)_1fr]">
        <div className="relative aspect-square sm:aspect-auto">
          <img onError={posterFallback} alt="" className="h-full w-full object-cover" src={hero} />
          <span className="absolute inset-0 bg-gradient-to-t from-[#1A1713] via-transparent to-transparent sm:bg-gradient-to-r" />
        </div>

        <div className="p-6">
          <h3 className="font-display text-3xl leading-tight">{recap.headline}</h3>
          {recap.spanLine && <p className="mt-2 text-sm text-[#C9C1B4]">{recap.spanLine}</p>}

          <div className="mt-5 grid grid-cols-3 gap-3 border-y border-white/10 py-4 text-center sm:grid-cols-4">
            <RecapStat label="artists" value={recap.artists} />
            <RecapStat label="venues" value={recap.venues} />
            <RecapStat label="cities" value={recap.cities} />
            {recap.averageRating !== null && (
              <RecapStat label="average" value={recap.averageRating.toFixed(1)} />
            )}
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <RecapList label="Most seen" items={recap.topArtists.slice(0, 3)} />
            <RecapList label="Most often" items={recap.topVenues.slice(0, 3)} />
          </dl>

          {recap.highestRated && (
            <p className="mt-4 flex items-start gap-2 border-l-2 border-[#4EC98F] pl-3 text-xs leading-5 text-[#C9C1B4]">
              <Star className="mt-0.5 h-3 w-3 shrink-0 fill-[#4EC98F] text-[#4EC98F]" />
              <span>
                Your best night: <b className="text-white">{recap.highestRated.title}</b>
                {recap.highestRated.venueName ? ` at ${recap.highestRated.venueName}` : ""}
                , {formatDate(recap.highestRated.date)} — {recap.highestRated.rating} stars.
              </span>
            </p>
          )}

          {recap.reclaimed > 0 && (
            <p className="mt-3 text-xs leading-5 text-[#8A8177]">
              I brought {recap.reclaimed} of these back from your camera roll. You never typed them in.
            </p>
          )}

          <RecapExport recap={{ ...recap, heroImage: hero }} userId={userId} />

          {recap.lowSignal && (
            <p className="mt-3 text-xs leading-5 text-[#8A8177]">
              Averages stay hidden until five logged shows — this is a recap of a
              beginning, and it says so.
            </p>
          )}
        </div>
      </div>

      {recap.photos.length > 1 && (
        <div className="hide-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {recap.photos.slice(1).map((photo) => (
            <img
              alt=""
              className="h-20 w-20 shrink-0 object-cover"
              key={photo.url}
              onError={posterFallback}
              src={photo.url ?? undefined}
            />
          ))}
        </div>
      )}
      {recap.photos.length === 0 && (
        <EmptyLine text="Add photos to a logged show and your own shots lead the recap instead of the poster." />
      )}
    </section>
  );
}

function RecapStat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="block">
      <b className="font-display block text-2xl">{value}</b>
      <small className="text-[10px] uppercase tracking-wide text-[#8A8177]">{label}</small>
    </span>
  );
}

function RecapList({ label, items }: { label: string; items: readonly { name: string; count: number }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-wide text-[#8A8177]">{label}</dt>
      <dd className="mt-1 space-y-1">
        {items.map((item) => (
          <span className="flex items-baseline justify-between gap-3" key={item.name}>
            <b className="min-w-0 truncate text-sm font-bold">{item.name}</b>
            <small className="shrink-0 text-[#8A8177]">
              {item.count} {item.count === 1 ? "night" : "nights"}
            </small>
          </span>
        ))}
      </dd>
    </div>
  );
}
