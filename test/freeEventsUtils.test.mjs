import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTicketmasterEvents,
  normalizeSetlistFmSetlists,
  normalizeBandsintownEvents,
  setlistDateToIso,
  setlistSongs,
  spotifyArtistFields,
  musicbrainzArtistFields,
  toImportEvents,
} from "../convex/freeEventsUtils.js";

test("normalizeTicketmasterEvents maps to the Showtonic upcomingEvent shape", () => {
  const [event] = normalizeTicketmasterEvents({
    _embedded: {
      events: [
        {
          id: "G5v0Z9Yqe",
          name: "Charli XCX",
          url: "https://www.ticketmaster.com/event/G5v0Z9Yqe",
          dates: { start: { localDate: "2026-09-12", localTime: "20:00:00" } },
          images: [
            { ratio: "3_2", url: "https://img/small.jpg", width: 305 },
            { ratio: "16_9", url: "https://img/wide.jpg", width: 2048 },
          ],
          classifications: [{ genre: { name: "Pop" }, subGenre: { name: "Pop" } }],
          _embedded: {
            venues: [
              {
                name: "The Fillmore",
                city: { name: "San Francisco" },
                state: { stateCode: "CA" },
                location: { latitude: "37.7841", longitude: "-122.4331" },
              },
            ],
            attractions: [{ id: "K8vZ917", name: "Charli XCX" }],
          },
        },
      ],
    },
  });

  assert.equal(event.jambaseId, "tm:G5v0Z9Yqe");
  assert.equal(event.title, "Charli XCX");
  assert.equal(event.date, "2026-09-12");
  assert.equal(event.startTime, "20:00");
  assert.equal(event.venueName, "The Fillmore");
  assert.equal(event.city, "San Francisco");
  assert.equal(event.region, "CA");
  assert.equal(event.latitude, 37.7841);
  assert.equal(event.longitude, -122.4331);
  assert.equal(event.image, "https://img/wide.jpg"); // widest 16:9 wins
  assert.deepEqual(event.artistNames, ["Charli XCX"]);
  assert.deepEqual(event.artistJambaseIds, ["tm-attraction:K8vZ917"]);
  assert.deepEqual(event._genres, ["Pop"]); // deduped genre + subgenre
  assert.equal(event.jambaseUrl, "https://www.ticketmaster.com/event/G5v0Z9Yqe");
});

test("normalizeTicketmasterEvents infers a festival group for multi-artist fests", () => {
  const [event] = normalizeTicketmasterEvents({
    _embedded: {
      events: [
        {
          id: "F1",
          name: "Outside Lands Music Festival",
          dates: { start: { localDate: "2026-08-07" } },
          _embedded: {
            attractions: [{ id: "a1", name: "Foo" }, { id: "a2", name: "Bar" }],
            venues: [{ name: "Golden Gate Park", city: { name: "San Francisco" } }],
          },
        },
      ],
    },
  });
  assert.equal(event.festivalId, "outside-lands-music-festival-2026");
});

test("normalizeSetlistFmSetlists converts dates and carries the MBID join key", () => {
  const [event] = normalizeSetlistFmSetlists({
    setlist: [
      {
        id: "63de4613",
        eventDate: "07-08-2026",
        artist: { mbid: "8538e728-ca0b-4321-b7e5-cff6565dd4c0", name: "Depeche Mode" },
        venue: {
          name: "The Warfield",
          city: { name: "San Francisco", stateCode: "CA", coords: { lat: 37.7827, long: -122.4098 } },
        },
        tour: { name: "Memento Mori Tour" },
        url: "https://www.setlist.fm/setlist/63de4613.html",
        sets: { set: [{ song: [{ name: "Wagging Tongue" }, { name: "Walking in My Shoes" }] }] },
      },
    ],
  });

  assert.equal(event.jambaseId, "slfm:63de4613");
  assert.equal(event.date, "2026-08-07");
  assert.equal(event.title, "Depeche Mode");
  assert.equal(event.venueName, "The Warfield");
  assert.equal(event.city, "San Francisco");
  assert.equal(event.latitude, 37.7827);
  assert.equal(event.longitude, -122.4098);
  assert.equal(event.stage, "Memento Mori Tour");
  assert.deepEqual(event.artistJambaseIds, ["mbid:8538e728-ca0b-4321-b7e5-cff6565dd4c0"]);
  assert.deepEqual(event._songs, ["Wagging Tongue", "Walking in My Shoes"]);
});

test("normalizeBandsintownEvents maps venue geo and ticket offer url", () => {
  const [event] = normalizeBandsintownEvents(
    [
      {
        id: "104755330",
        url: "https://www.bandsintown.com/e/104755330",
        datetime: "2026-09-12T20:00:00",
        title: "",
        venue: {
          name: "The Independent",
          city: "San Francisco",
          region: "CA",
          latitude: "37.7766",
          longitude: "-122.4376",
        },
        lineup: ["Tame Impala"],
        offers: [{ type: "Tickets", url: "https://tickets.example/104755330", status: "available" }],
      },
    ],
    "Tame Impala",
  );

  assert.equal(event.jambaseId, "bit:104755330");
  assert.equal(event.title, "Tame Impala"); // falls back to lineup when title empty
  assert.equal(event.date, "2026-09-12");
  assert.equal(event.startTime, "20:00");
  assert.equal(event.venueName, "The Independent");
  assert.equal(event.city, "San Francisco");
  assert.equal(event.latitude, 37.7766);
  assert.equal(event.longitude, -122.4376);
  assert.deepEqual(event.artistNames, ["Tame Impala"]);
  assert.equal(event.jambaseUrl, "https://tickets.example/104755330"); // offer beats event url
});

test("setlistDateToIso handles the dd-MM-yyyy format and rejects junk", () => {
  assert.equal(setlistDateToIso("07-08-2026"), "2026-08-07");
  assert.equal(setlistDateToIso("2026-08-07"), "");
  assert.equal(setlistDateToIso(undefined), "");
});

test("setlistSongs flattens multiple sets in order", () => {
  const songs = setlistSongs({
    sets: { set: [{ song: [{ name: "A" }] }, { name: "Encore", song: [{ name: "B" }, { name: "C" }] }] },
  });
  assert.deepEqual(songs, ["A", "B", "C"]);
});

test("toImportEvents strips non-schema hint keys", () => {
  const [clean] = toImportEvents([
    { jambaseId: "tm:1", title: "X", date: "2026-01-01", _genres: ["Pop"], _songs: ["s"] },
  ]);
  assert.equal("_genres" in clean, false);
  assert.equal("_songs" in clean, false);
  assert.equal(clean.jambaseId, "tm:1");
});

test("spotifyArtistFields picks the first image, genres, and url", () => {
  const fields = spotifyArtistFields({
    artists: {
      items: [
        {
          id: "6sHCvZfBBt7f5xkG2Uo2Sc",
          images: [{ url: "https://i.scdn.co/big.jpg" }],
          genres: ["hyperpop", "pop", "dance pop", "electropop", "art pop", "extra"],
          external_urls: { spotify: "https://open.spotify.com/artist/6sHCvZfBBt7f5xkG2Uo2Sc" },
        },
      ],
    },
  });
  assert.equal(fields.image, "https://i.scdn.co/big.jpg");
  assert.equal(fields.genres.length, 5); // capped
  assert.equal(fields.spotifyUrl, "https://open.spotify.com/artist/6sHCvZfBBt7f5xkG2Uo2Sc");
});

test("musicbrainzArtistFields returns mbid, hometown, and top tags", () => {
  const fields = musicbrainzArtistFields({
    artists: [
      {
        id: "260b6184-8828-48eb-945c-bc4cb6fc34ca",
        area: { name: "United Kingdom" },
        tags: [
          { name: "pop", count: 5 },
          { name: "electropop", count: 9 },
        ],
      },
    ],
  });
  assert.equal(fields.mbid, "260b6184-8828-48eb-945c-bc4cb6fc34ca");
  assert.equal(fields.hometown, "United Kingdom");
  assert.deepEqual(fields.genres, ["electropop", "pop"]); // sorted by count desc
});
