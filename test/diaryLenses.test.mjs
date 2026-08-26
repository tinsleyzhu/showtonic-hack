import assert from "node:assert/strict";
import test from "node:test";

import { groupMemories } from "../app/liveData.js";

const memory = (id, venueName, date, rating = 4) => ({
  id,
  showId: id,
  rating,
  note: "",
  caption: "",
  song: "",
  vibes: [],
  photo: "",
  date,
  artistNames: ["Artist " + id],
  artistGenres: [],
  venueName,
  city: "San Francisco",
});

test("venue lens ranks rooms by visit count before recency (design 20)", () => {
  const memories = [
    memory("a", "Knockdown Center", "2026-01-01"),
    memory("b", "Knockdown Center", "2026-02-01"),
    memory("c", "Knockdown Center", "2026-03-01"),
    memory("d", "Brooklyn Steel", "2026-08-01"), // most recent but fewer visits
    memory("e", "Brooklyn Steel", "2026-07-01"),
  ];
  const groups = groupMemories(memories, "Venue");
  assert.deepEqual(
    groups.map((group) => [group.label, group.count]),
    [
      ["Knockdown Center", 3],
      ["Brooklyn Steel", 2],
    ],
  );
});

test("equal counts fall back to recency", () => {
  const memories = [
    memory("a", "Old Room", "2024-01-01"),
    memory("b", "New Room", "2026-01-01"),
  ];
  const groups = groupMemories(memories, "Venue");
  assert.deepEqual(groups.map((group) => group.label), ["New Room", "Old Room"]);
});
