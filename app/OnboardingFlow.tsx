"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Check, LocateFixed, MapPin, Music2, ScanSearch, Search, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { OnboardingIntent, OnboardingProfile, OnboardingStep } from "./onboarding.d";
import {
  ONBOARDING_ARTISTS,
  ONBOARDING_STEPS,
  TASTE_SEED_MIN,
  canLeaveOnboardingStep,
  describeTasteSelection,
  nextOnboardingStep,
  onboardingStepIndex,
  previousOnboardingStep,
  validateOnboardingHandle,
} from "./onboarding.js";
import { cityCoordinates, nearestHomeCity } from "./views/shared";

// Card palette from the design exports' stacked show cards (01, 04, 09).
const CARD_COLORS = ["#F97354", "#6FBCD3", "#9B7FB8", "#5F7A5E", "#D9B44A"];

function colorFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CARD_COLORS[hash % CARD_COLORS.length];
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

type WizardStep = OnboardingStep | "signin";

const STEP_TITLES: Record<WizardStep, string> = {
  welcome: "Showtonic",
  signin: "Sign in",
  identity: "Your diary",
  taste: "Your taste",
  homebase: "Home base",
  handoff: "Ready",
};

export function Onboarding({
  initialProfile,
  onComplete,
  onLogin,
}: {
  initialProfile: OnboardingProfile;
  onComplete: (profile: OnboardingProfile, intent: OnboardingIntent) => void;
  onLogin: (handle: string) => Promise<string>;
}) {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [handle, setHandle] = useState(initialProfile.handle === "tinsley" ? "" : initialProfile.handle);
  const [visibility, setVisibility] = useState<"public" | "private">(initialProfile.visibility);
  const [favorites, setFavorites] = useState<string[]>(initialProfile.favoriteArtists);
  const [homeCity, setHomeCity] = useState(initialProfile.homeCity);
  const [citySearch, setCitySearch] = useState("");
  const [locating, setLocating] = useState(false);
  const [genreFilter, setGenreFilter] = useState("");
  const [stepError, setStepError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const deferredHandle = useDeferredValue(handle);
  const handleValidation = validateOnboardingHandle(deferredHandle);
  const availability = useQuery(
    api.users.checkHandle,
    step === "identity" && deferredHandle.trim() && !handleValidation.error
      ? { handle: handleValidation.handle }
      : "skip",
  );
  const catalogArtists = useQuery(api.artists.forOnboarding, step === "taste" ? { limit: 18 } : "skip");
  // Genre-first: the picker leads with what is actually playing near you soon,
  // family-capped so a jazz-heavy city cannot fill every slot with jazz.
  const onboardingGenres = useQuery(
    api.taste.genresForOnboarding,
    step === "taste" ? { today: todayIso(), homeCity, limit: 10 } : "skip",
  );
  const genreArtists = useQuery(
    api.taste.artistsForGenre,
    step === "taste" && genreFilter
      ? { genre: genreFilter, today: todayIso(), homeCity, limit: 18 }
      : "skip",
  );
  const cityStats = useQuery(
    api.discovery.cityStats,
    step === "homebase" ? { today: todayIso() } : "skip",
  );

  function go(next: WizardStep) {
    setStepError("");
    setStep(next);
  }

  const tasteChoices = useMemo(() => {
    const source = genreFilter ? genreArtists : catalogArtists;
    if (source?.length) {
      return source.map((artist) => ({
        name: artist.name,
        image: artist.image,
        genre: artist.genres[0] ?? "Live artist",
      }));
    }
    // A genre with nothing upcoming shows an empty grid rather than silently
    // falling back to the general list, which would look like a broken filter.
    if (genreFilter) return [];
    return ONBOARDING_ARTISTS.map((name) => ({ name, image: undefined, genre: "Live artist" }));
  }, [catalogArtists, genreArtists, genreFilter]);

  const wizardSteps = ONBOARDING_STEPS.filter((item) => item !== "welcome");
  const stepNumber = Math.max(onboardingStepIndex(step as OnboardingStep), 1);

  function profileDraft(): OnboardingProfile {
    return {
      completed: false,
      handle: handleValidation.handle,
      favoriteArtists: favorites,
      homeCity,
      visibility,
    };
  }

  function advance() {
    const gate = canLeaveOnboardingStep(step, { handle, favoriteArtists: favorites });
    if (!gate.ok) {
      setStepError(gate.reason);
      return;
    }
    go(nextOnboardingStep(step as OnboardingStep));
  }

  function retreat() {
    go(step === "signin" ? "welcome" : previousOnboardingStep(step as OnboardingStep));
  }

  function toggleFavorite(name: string) {
    setFavorites((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  async function submitLogin() {
    if (loginBusy) return;
    setLoginBusy(true);
    setStepError("");
    try {
      const error = await onLogin(handle);
      if (error) setStepError(error);
    } finally {
      setLoginBusy(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStepError("Location is unavailable in this browser. Pick a city below.");
      return;
    }
    setLocating(true);
    setStepError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const available = (cityStats ?? []).map((entry) => entry.city);
        const withCoordinates = available.filter((city) => cityCoordinates[city]);
        const city = withCoordinates.length
          ? nearestHomeCity(coords.latitude, coords.longitude, withCoordinates)
          : available[0] ?? "San Francisco";
        setHomeCity(city);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setStepError("Location not shared. Pick a city below or skip for now.");
      },
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 8_000 },
    );
  }

  const selectedCityStats = cityStats?.find((entry) => entry.city === homeCity);
  const payoffArtistCount = selectedCityStats
    ? favorites.filter((name) => selectedCityStats.artistNames.includes(name)).length
    : 0;
  const visibleCities = (cityStats ?? []).filter((entry) =>
    entry.city.toLocaleLowerCase().includes(citySearch.trim().toLocaleLowerCase()),
  );

  return (
    <main className="flex min-h-screen justify-center bg-[#0A0908] text-[#F5F1E8]">
      <div className="onboarding-reveal flex w-full max-w-md flex-col px-5 pb-10 pt-6" key={step}>
        {/* Top bar */}
        <div className="flex items-center justify-between">
          {step === "welcome" ? (
            <span aria-hidden className="h-6 w-2 bg-[#FF7A50]" />
          ) : (
            <button aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2A2521]" onClick={retreat} type="button">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <p className="text-sm font-black uppercase tracking-[0.3em]">{STEP_TITLES[step]}</p>
          <span className="h-10 w-10" aria-hidden />
        </div>

        {/* Progress segments (wizard steps only) */}
        {step !== "welcome" && step !== "signin" && (
          <div className="mt-5 grid grid-cols-4 gap-2">
            {wizardSteps.map((item, index) => (
              <span
                className={`h-1 ${index < stepNumber ? "bg-[#FF7A50]" : "bg-[#2A2521]"}`}
                key={item}
              />
            ))}
          </div>
        )}

        {step === "welcome" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-10 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Your live music life</p>
            <h1 className="font-display mt-3 text-5xl leading-[1.02]">Remember every show you&apos;ve ever loved.</h1>
            <p className="mt-4 text-sm leading-6 text-[#8A8177]">
              Build your concert diary, discover what&apos;s next, and find people who hear music the way you do.
            </p>
            {/* Stacked show cards */}
            <div className="relative mx-auto mt-8 h-72 w-full max-w-xs">
              {[
                { name: "Jamie xx", year: "2024", color: CARD_COLORS[1], rotate: "-rotate-12", offset: "left-0 top-10" },
                { name: "RÜFÜS DU SOL", year: "2026", color: CARD_COLORS[2], rotate: "rotate-12", offset: "right-0 top-8" },
                { name: "Fred again..", year: "2025", color: CARD_COLORS[0], rotate: "rotate-2", offset: "left-1/2 -translate-x-1/2 top-0" },
              ].map((card) => (
                <div
                  className={`absolute ${card.offset} ${card.rotate} flex h-52 w-36 flex-col justify-end rounded-lg p-3 shadow-2xl`}
                  key={card.name}
                  style={{ backgroundColor: card.color }}
                >
                  <span aria-hidden className="absolute left-1/2 top-6 h-20 w-24 -translate-x-1/2 rounded-[50%] border border-white/60" />
                  <b className="font-display text-sm text-[#0A0908]">{card.name}</b>
                  <span className="font-display text-sm text-[#0A0908]">{card.year}</span>
                </div>
              ))}
            </div>
            <button className="mt-8 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black" onClick={() => go("identity")} type="button">
              Build my music diary
            </button>
            <button className="mt-3 w-full cursor-not-allowed border border-[#2A2521] px-5 py-4 text-sm font-black text-[#6B6258]" disabled title="Claimed accounts arrive with a later build" type="button">
               Continue with Apple · coming soon
            </button>
            <button className="mt-4 text-sm font-black text-[#4EC98F]" onClick={() => go("signin")} type="button">
              Already have a diary? Sign in
            </button>
          </section>
        )}

        {step === "signin" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Welcome back</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">Your diary is right where you left it.</h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">
              Sign in to restore your shows, follows, reviews, and watchlist.
            </p>
            <label className="mt-8 block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A8177]">Username</span>
              <div className="mt-2 flex items-center border border-[#2A2521] bg-[#141210] px-4 py-4">
                <span className="text-[#8A8177]">@</span>
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent pl-1 text-base outline-none"
                  onChange={(event) => setHandle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitLogin();
                  }}
                  placeholder="yourhandle"
                  value={handle}
                />
              </div>
            </label>
            <p className="mt-3 border-l-2 border-[#6FBCD3] bg-[#141210] p-3 text-xs leading-5 text-[#8A8177]">
              This build signs you in by handle. Passwords and Apple sign-in arrive when accounts can be claimed.
            </p>
            {stepError && <p className="mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{stepError}</p>}
            <div className="flex-1" />
            <button className="mt-8 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60" disabled={loginBusy} onClick={() => void submitLogin()} type="button">
              {loginBusy ? "Signing in..." : "Sign in"}
            </button>
          </section>
        )}

        {step === "identity" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Step {stepNumber} of {wizardSteps.length}</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">What should we call your music diary?</h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">
              This becomes the handle on your public profile and shareable show cards. You can change it later.
            </p>
            <label className="mt-8 block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A8177]">Username</span>
              <div className="mt-2 flex items-center gap-2 border border-[#2A2521] bg-[#141210] px-4 py-4">
                <span className="text-[#8A8177]">@</span>
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-base outline-none"
                  onChange={(event) => setHandle(event.target.value)}
                  placeholder="yourhandle"
                  value={handle}
                />
                {handle.trim() && !handleValidation.error && availability !== undefined && (
                  availability.available ? (
                    <span className="text-xs font-black text-[#4EC98F]">Available</span>
                  ) : (
                    <span className="text-xs font-black text-[#F97354]">Taken</span>
                  )
                )}
              </div>
            </label>
            {handle.trim() && handleValidation.error && (
              <p className="mt-2 text-xs text-[#F97354]">{handleValidation.error}</p>
            )}
            {availability && !availability.available && availability.suggestion && (
              <button className="mt-2 text-left text-xs text-[#4EC98F]" onClick={() => setHandle(availability.suggestion ?? "")} type="button">
                Try @{availability.suggestion} instead
              </button>
            )}
            <div className="mt-6">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A8177]">Profile visibility</span>
              <button
                className="mt-2 flex w-full items-center justify-between border border-[#2A2521] bg-[#141210] px-4 py-4 text-left"
                onClick={() => setVisibility(visibility === "public" ? "private" : "public")}
                type="button"
              >
                <span className="text-sm font-bold">{visibility === "public" ? "Public diary" : "Private diary"}</span>
                <span className="text-xs font-black text-[#4EC98F]">Change</span>
              </button>
            </div>
            <p className="mt-4 border-l-2 border-[#6FBCD3] bg-[#141210] p-3 text-xs leading-5 text-[#8A8177]">
              <b className="text-[#F5F1E8]">No email yet.</b> The diary begins on this device — claim it with Apple or email after your first share.
            </p>
            {stepError && <p className="mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{stepError}</p>}
            <div className="flex-1" />
            <button
              className="mt-8 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60"
              disabled={Boolean(handleValidation.error) || availability?.available === false}
              onClick={advance}
              type="button"
            >
              Continue
            </button>
          </section>
        )}

        {step === "taste" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Step {stepNumber} of {wizardSteps.length}</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">Start with artists you&apos;d cross town to see.</h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">
              Pick at least {TASTE_SEED_MIN}. This makes Discover useful before your history is ready.
              {homeCity ? ` Genres below are what's actually playing in ${homeCity} soon.` : ""}
            </p>
            {!!onboardingGenres?.length && (
              <div className="hide-scrollbar mt-6 flex gap-2 overflow-x-auto">
                <button
                  className={`shrink-0 border px-4 py-2 text-xs font-bold ${genreFilter ? "border-[#2A2521] text-[#C9C1B4]" : "border-[#FF7A50] bg-[#FF7A50] text-black"}`}
                  onClick={() => setGenreFilter("")}
                  type="button"
                >
                  Most seen
                </button>
                {onboardingGenres.map((entry) => (
                  <button
                    className={`shrink-0 border px-4 py-2 text-xs font-bold capitalize ${genreFilter === entry.genre ? "border-[#FF7A50] bg-[#FF7A50] text-black" : "border-[#2A2521] text-[#C9C1B4]"}`}
                    key={entry.genre}
                    onClick={() => setGenreFilter(entry.genre === genreFilter ? "" : entry.genre)}
                    type="button"
                  >
                    {entry.genre}
                  </button>
                ))}
              </div>
            )}
            {genreFilter && genreArtists?.length === 0 && (
              <p className="mt-4 border-l-2 border-[#6FBCD3] pl-3 text-xs leading-5 text-[#8A8177]">
                Nothing upcoming in {genreFilter} yet — try another, or go back to most seen.
              </p>
            )}
            <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-5">
              {tasteChoices.map((artist) => {
                const selected = favorites.includes(artist.name);
                return (
                  <button className="flex flex-col items-center gap-2 text-center" key={artist.name} onClick={() => toggleFavorite(artist.name)} type="button">
                    <span className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full border-2 ${selected ? "border-[#4EC98F]" : "border-transparent"}`} style={{ backgroundColor: colorFor(artist.name) }}>
                      {artist.image ? (
                        <img alt={artist.name} className="h-full w-full object-cover" src={artist.image} />
                      ) : (
                        <span className="font-display text-3xl text-[#F5F1E8]">{artist.name.slice(0, 1)}</span>
                      )}
                      {selected && (
                        <span className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#4EC98F]">
                          <Check className="h-4 w-4 text-black" />
                        </span>
                      )}
                    </span>
                    <span className="w-full truncate text-xs font-bold">{artist.name}</span>
                  </button>
                );
              })}
            </div>
            <div className={`mt-6 flex items-center justify-between border px-4 py-3 text-sm ${favorites.length >= TASTE_SEED_MIN ? "border-[#4EC98F]/40 bg-[#15251C]" : "border-[#2A2521] bg-[#141210]"}`}>
              <span className={favorites.length >= TASTE_SEED_MIN ? "text-[#BFE8D2]" : "text-[#8A8177]"}>
                {describeTasteSelection(favorites.length)}
              </span>
              {favorites.length >= TASTE_SEED_MIN && <Check className="h-4 w-4 text-[#4EC98F]" />}
            </div>
            {stepError && <p className="mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{stepError}</p>}
            <button className="mt-6 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60" disabled={favorites.length < TASTE_SEED_MIN} onClick={advance} type="button">
              Continue with these artists
            </button>
            <button className="mt-3 w-full cursor-not-allowed border border-[#2A2521] px-5 py-4 text-sm font-black text-[#6B6258]" disabled title="Streaming import arrives with a later build" type="button">
              <Music2 className="mr-2 inline h-4 w-4" /> Import from Spotify or Apple Music · soon
            </button>
          </section>
        )}

        {step === "homebase" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Step {stepNumber} of {wizardSteps.length} · location is optional</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">Find the shows worth leaving home for.</h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">
              Location powers nearby concerts and your default city. It is never shown on your public profile.
            </p>
            {homeCity && (
              <div className="mt-5 border border-[#2A2521] bg-[#141210] p-4">
                <b className="text-sm">{selectedCityStats ? `${selectedCityStats.upcomingCount} upcoming shows in ${homeCity}` : homeCity}</b>
                {payoffArtistCount > 0 && (
                  <p className="mt-1 text-xs text-[#4EC98F]">Including {payoffArtistCount} {payoffArtistCount === 1 ? "artist" : "artists"} you selected</p>
                )}
              </div>
            )}
            <button className="mt-5 flex w-full items-center justify-center gap-2 bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60" disabled={locating} onClick={useCurrentLocation} type="button">
              <LocateFixed className="h-4 w-4" /> {locating ? "Locating..." : "Use my current location"}
            </button>
            <label className="mt-6 block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A8177]">Search city</span>
              <div className="mt-2 flex items-center gap-2 border border-[#2A2521] bg-[#141210] px-4 py-3">
                <Search className="h-4 w-4 text-[#8A8177]" />
                <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setCitySearch(event.target.value)} placeholder="City name" value={citySearch} />
                {citySearch && <button aria-label="Clear city search" onClick={() => setCitySearch("")} type="button"><X className="h-4 w-4" /></button>}
              </div>
            </label>
            <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
              {(visibleCities.length ? visibleCities : cityStats ?? []).slice(0, 5).map((entry) => (
                <button className="flex w-full items-center gap-3 py-3 text-left" key={entry.city} onClick={() => setHomeCity(entry.city)} type="button">
                  <span className="flex h-10 w-10 items-center justify-center" style={{ backgroundColor: colorFor(entry.city) }}>
                    <MapPin className="h-4 w-4 text-[#0A0908]" />
                  </span>
                  <span className="flex-1">
                    <b className="block text-sm">{entry.city}</b>
                    <small className="text-[#8A8177]">{entry.upcomingCount} upcoming shows</small>
                  </span>
                  {homeCity === entry.city && <Check className="h-4 w-4 text-[#4EC98F]" />}
                </button>
              ))}
              {cityStats === undefined && <p className="py-3 text-sm text-[#8A8177]">Loading cities…</p>}
            </div>
            {stepError && <p className="mt-3 border border-red-400/60 bg-red-950/30 p-3 text-sm text-red-200">{stepError}</p>}
            <div className="flex-1" />
            <button className="mt-6 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black disabled:opacity-60" disabled={!homeCity} onClick={advance} type="button">
              {homeCity ? `Use ${homeCity} as home base` : "Pick a city to continue"}
            </button>
            <button className="mt-3 text-sm font-black text-[#4EC98F]" onClick={() => { setHomeCity(""); go("handoff"); }} type="button">
              Skip for now
            </button>
          </section>
        )}

        {step === "handoff" && (
          <section className="flex flex-1 flex-col">
            <p className="mt-8 text-xs font-black uppercase tracking-[0.24em] text-[#FF7A50]">Step {stepNumber} of {wizardSteps.length}</p>
            <h1 className="font-display mt-3 text-4xl leading-[1.05]">Your diary is ready, @{handleValidation.handle}.</h1>
            <p className="mt-3 text-sm leading-6 text-[#8A8177]">
              Start with the night you remember best, or see what&apos;s coming to {homeCity || "your city"} first.
            </p>
            <div className="mt-6 border border-[#2A2521] bg-[#141210] p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3A2018]">
                  <ScanSearch className="h-5 w-5 text-[#FF7A50]" />
                </span>
                <div>
                  <b className="text-sm">Your camera roll already remembers the shows.</b>
                  <p className="mt-1 text-xs text-[#8A8177]">Scan your photos on-device and reclaim years of nights with a few taps.</p>
                </div>
              </div>
            </div>
            <div className="flex-1" />
            <button className="mt-8 w-full bg-[#FF7A50] px-5 py-4 text-sm font-black text-black" onClick={() => onComplete(profileDraft(), "backfill")} type="button">
              Find my past shows
            </button>
            <button className="mt-3 w-full border border-[#2A2521] px-5 py-4 text-sm font-black" onClick={() => onComplete(profileDraft(), "log")} type="button">
              Log my first show
            </button>
            <button className="mt-4 text-sm font-black text-[#4EC98F]" onClick={() => onComplete(profileDraft(), "explore")} type="button">
              Browse shows near me
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
