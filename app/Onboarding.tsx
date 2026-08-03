"use client";

import { useEffect, useRef, useState } from "react";

type OnboardingProfile = {
  completed: boolean;
  handle: string;
  favoriteArtists: string[];
};

type OnboardingIntent = "explore" | "log";

type OnboardingRuntime = {
  ONBOARDING_ARTISTS: readonly string[];
  validateOnboardingHandle(value: string): { handle: string; error: string };
};

// Import through CommonJS to preserve the Task 1 runtime dependency without
// TypeScript confusing this file with onboarding.js on case-insensitive disks.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- See the filename-collision note above.
const { ONBOARDING_ARTISTS, validateOnboardingHandle } = require("./onboarding.js") as OnboardingRuntime;

type OnboardingProps = {
  initialProfile: OnboardingProfile;
  onComplete: (profile: OnboardingProfile, intent: OnboardingIntent) => void;
};

type OnboardingStep = "welcome" | "handle" | "taste" | "handoff";

const STEPS: readonly OnboardingStep[] = ["welcome", "handle", "taste", "handoff"];

const stepContent: Record<OnboardingStep, { eyebrow: string; title: string; detail: string }> = {
  welcome: {
    eyebrow: "Welcome to Showtonic",
    title: "Your life, set to live music.",
    detail: "Discover live shows, log the feeling, and build a music diary.",
  },
  handle: {
    eyebrow: "Set your handle",
    title: "Put your name on the guest list.",
    detail: "This is how your diary and taste will be known around Showtonic.",
  },
  taste: {
    eyebrow: "Choose your sound",
    title: "Who always makes the set list?",
    detail: "Pick at least two artists and we will start your discovery shelf in the right place.",
  },
  handoff: {
    eyebrow: "Your diary is ready",
    title: "The next show is yours.",
    detail: "Your profile is tuned for the rooms, artists, and memories that matter to you.",
  },
};

function stepNumber(step: OnboardingStep) {
  return String(STEPS.indexOf(step) + 1).padStart(2, "0");
}

export function Onboarding({ initialProfile, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [handle, setHandle] = useState(initialProfile.handle);
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>(initialProfile.favoriteArtists);
  const [handleError, setHandleError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const content = stepContent[step];
  const currentStep = STEPS.indexOf(step) + 1;

  function continueFromHandle() {
    const validation = validateOnboardingHandle(handle);
    if (validation.error) {
      setHandleError(validation.error);
      return;
    }

    setHandle(validation.handle);
    setHandleError("");
    setStep("taste");
  }

  function toggleArtist(artist: string) {
    setFavoriteArtists((current) =>
      current.includes(artist) ? current.filter((item) => item !== artist) : [...current, artist],
    );
  }

  function complete(intent: OnboardingIntent) {
    onComplete(
      {
        completed: true,
        handle,
        favoriteArtists,
      },
      intent,
    );
  }

  return (
    <main className="min-h-screen bg-[#14181C] text-[#F4F6F8]">
      <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)]">
        <aside className="relative hidden overflow-hidden border-r border-white/15 px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-14">
          <div className="relative z-10">
            <p className="text-xs font-black uppercase tracking-[0.34em] text-[#20D6AA]">Showtonic</p>
            <p className="mt-5 max-w-xs text-sm leading-6 text-[#9AA8B4]">A living record of every room that changed your week.</p>
          </div>
          <div className="relative z-10 space-y-2">
            {STEPS.map((item) => (
              <div className="flex items-baseline gap-4" key={item}>
                <span className={`text-5xl font-black tracking-[-0.08em] ${item === step ? "text-[#F4F6F8]" : "text-white/20"}`}>
                  {stepNumber(item)}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-[0.22em] ${item === step ? "text-[#83C9FF]" : "text-[#6A7782]"}`}>
                  {stepContent[item].eyebrow}
                </span>
              </div>
            ))}
          </div>
          <div className="relative z-10 space-y-5 border-t border-white/15 pt-7">
            {["Live discovery", "Verified memories", "Taste matching"].map((proof) => (
              <div className="flex items-center gap-3" key={proof}>
                <span className="h-2 w-2 bg-[#20D6AA]" />
                <span className="text-sm font-bold text-[#D8E0E6]">{proof}</span>
              </div>
            ))}
          </div>
          <span aria-hidden="true" className="absolute -right-20 top-[46%] h-px w-80 rotate-[-33deg] bg-[#20D6AA]" />
        </aside>

        <section className="flex min-h-screen items-center px-4 py-6 sm:px-8 sm:py-10 lg:px-12 xl:px-16">
          <div className="onboarding-reveal w-full border border-[#83C9FF]/45 bg-[#1B2228] p-6 shadow-[12px_12px_0_#0E151B] sm:p-9 lg:p-12">
            <div className="mb-10 flex items-center justify-between gap-5">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#83C9FF]">{content.eyebrow}</p>
              <p className="font-mono text-xs font-bold tracking-[0.16em] text-[#9AA8B4]">
                {stepNumber(step)} / 04
              </p>
            </div>

            <h1 className="max-w-xl text-4xl font-black leading-[0.95] tracking-[-0.055em] outline-none sm:text-6xl" ref={headingRef} tabIndex={-1}>
              {content.title}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#B7C2CB] sm:text-lg">{content.detail}</p>

            {step === "welcome" && (
              <div className="mt-10">
                <div className="grid gap-px border border-white/15 bg-white/15 sm:grid-cols-3 lg:hidden">
                  {["Live discovery", "Verified memories", "Taste matching"].map((proof, index) => (
                    <div className="min-h-28 bg-[#1B2228] p-4" key={proof}>
                      <span className="font-mono text-xs text-[#20D6AA]">0{index + 1}</span>
                      <p className="mt-5 text-sm font-bold">{proof}</p>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-10 min-h-11 w-full bg-[#F4F6F8] px-5 py-3 text-sm font-black text-[#14181C] transition-colors hover:bg-[#83C9FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF] sm:w-auto"
                  onClick={() => setStep("handle")}
                  type="button"
                >
                  Start your diary
                </button>
              </div>
            )}

            {step === "handle" && (
              <div className="mt-10 max-w-xl">
                <label className="block text-xs font-black uppercase tracking-[0.2em] text-[#D8E0E6]" htmlFor="onboarding-handle">
                  Handle
                </label>
                <div className="mt-3 flex border border-white/25 bg-[#14181C] focus-within:border-[#83C9FF]">
                  <span className="flex min-h-12 items-center px-4 text-xl font-bold text-[#83C9FF]">@</span>
                  <input
                    aria-describedby="onboarding-handle-error"
                    aria-invalid={Boolean(handleError)}
                    autoCapitalize="none"
                    autoComplete="nickname"
                    className="min-h-12 w-full bg-transparent pr-4 text-lg font-bold text-[#F4F6F8] outline-none placeholder:text-[#6A7782]"
                    id="onboarding-handle"
                    onChange={(event) => {
                      setHandle(event.target.value);
                      setHandleError("");
                    }}
                    placeholder="your_handle"
                    spellCheck="false"
                    type="text"
                    value={handle}
                  />
                </div>
                <p aria-live="polite" className="mt-3 min-h-5 text-sm text-[#FFB4AB]" id="onboarding-handle-error">
                  {handleError}
                </p>
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <BackButton onClick={() => setStep("welcome")} />
                  <button
                    className="min-h-11 bg-[#F4F6F8] px-5 py-3 text-sm font-black text-[#14181C] transition-colors hover:bg-[#83C9FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF]"
                    onClick={continueFromHandle}
                    type="button"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === "taste" && (
              <div className="mt-10">
                <div aria-label="Choose favorite artists" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" role="group">
                  {ONBOARDING_ARTISTS.map((artist, index) => {
                    const selected = favoriteArtists.includes(artist);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`flex min-h-36 flex-col justify-between border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF] ${selected ? "border-[#20D6AA] bg-[#17352F]" : "border-white/20 bg-[#14181C] hover:border-[#83C9FF]"}`}
                        key={artist}
                        onClick={() => toggleArtist(artist)}
                        type="button"
                      >
                        <span className="font-mono text-xs text-[#83C9FF]">{String(index + 1).padStart(2, "0")}</span>
                        <span className="text-lg font-black leading-5 tracking-[-0.03em]">{artist}</span>
                        <span className={`text-[10px] font-black uppercase tracking-[0.16em] ${selected ? "text-[#20D6AA]" : "text-[#9AA8B4]"}`}>
                          {selected ? "In rotation" : "Add to set"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-4 text-sm text-[#9AA8B4]" id="onboarding-artist-count">
                  {favoriteArtists.length} selected. Pick at least 2 to continue.
                </p>
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <BackButton onClick={() => setStep("handle")} />
                  <button
                    aria-describedby="onboarding-artist-count"
                    className="min-h-11 bg-[#F4F6F8] px-5 py-3 text-sm font-black text-[#14181C] transition-colors hover:bg-[#83C9FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF] disabled:bg-[#52606A] disabled:text-[#AAB5BD]"
                    disabled={favoriteArtists.length < 2}
                    onClick={() => setStep("handoff")}
                    type="button"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === "handoff" && (
              <div className="mt-10 max-w-xl">
                <div className="border border-[#20D6AA] bg-[#17352F] p-5 sm:p-6">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#20D6AA]">Profile ready</p>
                  <p className="mt-4 text-3xl font-black tracking-[-0.05em]">@{handle}</p>
                  <p className="mt-2 text-base text-[#BDF8E9]">{favoriteArtists.length} artists selected for your first recommendations.</p>
                </div>
                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <BackButton onClick={() => setStep("taste")} />
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      className="min-h-11 border border-white/35 px-5 py-3 text-sm font-black text-[#F4F6F8] transition-colors hover:border-[#83C9FF] hover:text-[#83C9FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF]"
                      onClick={() => complete("explore")}
                      type="button"
                    >
                      Explore shows
                    </button>
                    <button
                      className="min-h-11 bg-[#F4F6F8] px-5 py-3 text-sm font-black text-[#14181C] transition-colors hover:bg-[#83C9FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF]"
                      onClick={() => complete("log")}
                      type="button"
                    >
                      Log your first show
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div aria-hidden="true" className="mt-12 h-px bg-white/15">
              <div className="h-px bg-[#20D6AA] transition-[width] duration-300" style={{ width: `${(currentStep / STEPS.length) * 100}%` }} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="min-h-11 px-1 py-3 text-sm font-black text-[#B7C2CB] transition-colors hover:text-[#F4F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#83C9FF]"
      onClick={onClick}
      type="button"
    >
      Back
    </button>
  );
}
