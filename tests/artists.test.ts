import { describe, expect, test } from "bun:test";
import { cleanArtistTag, splitArtists } from "../shared/artists";

describe("shared/artists", () => {
  test("cleanArtistTag removes Topic and VEVO suffixes", () => {
    expect(cleanArtistTag("Lime - Topic")).toBe("Lime");
    expect(cleanArtistTag("ArtistVEVO")).toBe("Artist");
    expect(cleanArtistTag("  Aimer   -  Topic")).toBe("Aimer");
  });

  test("splitArtists splits collaborations while preserving '& the' band names", () => {
    expect(splitArtists("Lime & LilyPichu")).toEqual(["Lime", "LilyPichu"]);
    expect(splitArtists("Artist A, Artist B feat. Guest")).toEqual([
      "Artist A",
      "Artist B",
      "Guest",
    ]);
    expect(splitArtists("Richy Mitch & the Coal Miners")).toEqual([
      "Richy Mitch & the Coal Miners",
    ]);
    expect(splitArtists("KC & The Sunshine Band & Guest")).toEqual([
      "KC & The Sunshine Band",
      "Guest",
    ]);
  });
});
