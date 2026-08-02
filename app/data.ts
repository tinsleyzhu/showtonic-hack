export type Artist = {
  id: string;
  name: string;
  hometown: string;
  genres: string[];
  vibe: string;
  bio: string;
  topSong: string;
  image: string;
  jambaseUrl: string;
};

export type Venue = {
  id: string;
  name: string;
  city: string;
  region: string;
  image: string;
  description: string;
};

export type Show = {
  id: string;
  title: string;
  date: string;
  day: string;
  time: string;
  stage: string;
  venueId: string;
  artistIds: string[];
  image: string;
  jambaseUrl: string;
  memoryPrompt: string;
  artists?: Artist[];
  venue?: Venue;
  backendId?: string;
};

export type DemoLog = {
  user: string;
  showId: string;
  rating: number;
  vibes: string[];
  note: string;
  photo: string;
};

export type FakeUser = {
  handle: string;
  color: string;
  shows: string[];
  favoriteArtists: string[];
};

export const vibes = [
  "transcendent",
  "sound was insane",
  "sweaty",
  "too packed",
  "sunset set",
  "surprise guest",
  "all-nighter",
];

export const artists: Artist[] = [
  {
    id: "charli-xcx",
    name: "Charli XCX",
    hometown: "Cambridge, England",
    genres: ["hyperpop", "electropop", "club"],
    vibe: "Neon, chaotic, cathartic pop pressure.",
    bio: "A future-facing pop maximalist whose live sets turn hooks, edits, and crowd chants into a collective main-character moment.",
    topSong: "360",
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80",
    jambaseUrl: "https://www.jambase.com/band/charli-xcx",
  },
  {
    id: "rufus-du-sol",
    name: "RUFUS DU SOL",
    hometown: "Sydney, Australia",
    genres: ["indie dance", "house", "electronic"],
    vibe: "Huge sunset builds and warm dancefloor melancholy.",
    bio: "A live electronic trio built for twilight fields, glowing synths, and singalong drops that feel larger than the park.",
    topSong: "Innerbloom",
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80",
    jambaseUrl: "https://www.jambase.com/band/rufus-du-sol",
  },
  {
    id: "doechii",
    name: "Doechii",
    hometown: "Tampa, Florida",
    genres: ["rap", "alt-R&B", "performance"],
    vibe: "Sharp, theatrical, funny, and completely in control.",
    bio: "A live-wire performer with elastic flows, high-concept staging, and the kind of command that makes a mid-day set feel headline-sized.",
    topSong: "Nissan Altima",
    image:
      "https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1200&q=80",
    jambaseUrl: "https://www.jambase.com/band/doechii",
  },
  {
    id: "the-strokes",
    name: "The Strokes",
    hometown: "New York, New York",
    genres: ["indie rock", "garage rock", "post-punk"],
    vibe: "Loose, iconic, city-lit guitar nostalgia.",
    bio: "A defining New York rock band whose festival sets become a shared archive of riffs everyone somehow knows by heart.",
    topSong: "Last Nite",
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=80",
    jambaseUrl: "https://www.jambase.com/band/the-strokes",
  },
  {
    id: "tyla",
    name: "Tyla",
    hometown: "Johannesburg, South Africa",
    genres: ["amapiano", "pop", "R&B"],
    vibe: "Breezy, precise, sun-warmed movement.",
    bio: "A global pop voice bringing amapiano swing, glossy hooks, and choreography that makes the front row feel choreographed too.",
    topSong: "Water",
    image:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80",
    jambaseUrl: "https://www.jambase.com/band/tyla",
  },
  {
    id: "glass-beams",
    name: "Glass Beams",
    hometown: "Melbourne, Australia",
    genres: ["psychedelic", "instrumental", "funk"],
    vibe: "Masked, hypnotic, desert-night groove.",
    bio: "A mysterious instrumental act that blends psych guitar, funk basslines, and ritual-like repetition into a perfect late-afternoon discovery.",
    topSong: "Mahal",
    image:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80",
    jambaseUrl: "https://www.jambase.com/band/glass-beams",
  },
];

export const venues: Venue[] = [
  {
    id: "golden-gate-park",
    name: "Golden Gate Park",
    city: "San Francisco",
    region: "CA",
    image:
      "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1400&q=80",
    description:
      "Outside Lands turns the west end of Golden Gate Park into a foggy, food-heavy, multi-stage city for one weekend.",
  },
  {
    id: "the-independent",
    name: "The Independent",
    city: "San Francisco",
    region: "CA",
    image:
      "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1400&q=80",
    description:
      "A compact Divisadero room for catching the artist before the next festival crowd discovers them.",
  },
];

export const shows: Show[] = [
  {
    id: "charli-outside-lands",
    title: "Charli XCX at Outside Lands",
    date: "2026-08-07",
    day: "Friday",
    time: "8:20 PM",
    stage: "Lands End",
    venueId: "golden-gate-park",
    artistIds: ["charli-xcx"],
    image:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=80",
    jambaseUrl: "https://www.jambase.com/festival/outside-lands",
    memoryPrompt: "What was the brat-level crowd moment?",
  },
  {
    id: "rufus-outside-lands",
    title: "RUFUS DU SOL at Outside Lands",
    date: "2026-08-08",
    day: "Saturday",
    time: "8:10 PM",
    stage: "Twin Peaks",
    venueId: "golden-gate-park",
    artistIds: ["rufus-du-sol"],
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80",
    jambaseUrl: "https://www.jambase.com/festival/outside-lands",
    memoryPrompt: "Which drop made the field feel weightless?",
  },
  {
    id: "doechii-outside-lands",
    title: "Doechii at Outside Lands",
    date: "2026-08-08",
    day: "Saturday",
    time: "5:45 PM",
    stage: "Sutro",
    venueId: "golden-gate-park",
    artistIds: ["doechii"],
    image:
      "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1400&q=80",
    jambaseUrl: "https://www.jambase.com/festival/outside-lands",
    memoryPrompt: "What lyric or face card moment got the group chat going?",
  },
  {
    id: "strokes-outside-lands",
    title: "The Strokes at Outside Lands",
    date: "2026-08-09",
    day: "Sunday",
    time: "8:30 PM",
    stage: "Lands End",
    venueId: "golden-gate-park",
    artistIds: ["the-strokes"],
    image:
      "https://images.unsplash.com/photo-1508973379184-7517410fb0bc?auto=format&fit=crop&w=1400&q=80",
    jambaseUrl: "https://www.jambase.com/festival/outside-lands",
    memoryPrompt: "Which song turned strangers into backup singers?",
  },
  {
    id: "tyla-outside-lands",
    title: "Tyla at Outside Lands",
    date: "2026-08-09",
    day: "Sunday",
    time: "4:15 PM",
    stage: "Panhandle",
    venueId: "golden-gate-park",
    artistIds: ["tyla"],
    image:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1400&q=80",
    jambaseUrl: "https://www.jambase.com/festival/outside-lands",
    memoryPrompt: "Who actually knew the choreography?",
  },
  {
    id: "glass-beams-independent",
    title: "Glass Beams",
    date: "2026-08-14",
    day: "Friday",
    time: "9:00 PM",
    stage: "Main Room",
    venueId: "the-independent",
    artistIds: ["glass-beams"],
    image:
      "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1400&q=80",
    jambaseUrl: "https://www.jambase.com/band/glass-beams",
    memoryPrompt: "What groove stuck in your head after midnight?",
  },
];

export const demoLogs: DemoLog[] = [
  {
    user: "maya",
    showId: "charli-outside-lands",
    rating: 5,
    vibes: ["transcendent", "sweaty", "surprise guest"],
    note: "The whole hill was screaming every word.",
    photo:
      "https://images.unsplash.com/photo-1504704911898-68304a7d2807?auto=format&fit=crop&w=900&q=80",
  },
  {
    user: "jo",
    showId: "rufus-outside-lands",
    rating: 4.5,
    vibes: ["sunset set", "sound was insane"],
    note: "Fog rolled in right as Innerbloom opened up.",
    photo:
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=900&q=80",
  },
  {
    user: "eli",
    showId: "doechii-outside-lands",
    rating: 5,
    vibes: ["sweaty", "transcendent"],
    note: "Best crowd control of the weekend.",
    photo:
      "https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=900&q=80",
  },
];

export const fakeUsers: FakeUser[] = [
  {
    handle: "maya",
    color: "#FF3B0E",
    shows: ["charli-outside-lands", "rufus-outside-lands", "strokes-outside-lands"],
    favoriteArtists: ["Charli XCX", "RUFUS DU SOL", "The Strokes", "Caroline Polachek"],
  },
  {
    handle: "jo",
    color: "#B8F14A",
    shows: ["rufus-outside-lands", "tyla-outside-lands", "glass-beams-independent"],
    favoriteArtists: ["RUFUS DU SOL", "Tyla", "Glass Beams", "Kaytranada"],
  },
  {
    handle: "eli",
    color: "#62C6FF",
    shows: ["doechii-outside-lands", "charli-outside-lands", "tyla-outside-lands"],
    favoriteArtists: ["Doechii", "Charli XCX", "Tyla", "SZA"],
  },
  {
    handle: "nina",
    color: "#F7C948",
    shows: ["strokes-outside-lands", "glass-beams-independent"],
    favoriteArtists: ["The Strokes", "Glass Beams", "Khruangbin"],
  },
];
