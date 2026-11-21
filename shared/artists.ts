export function cleanArtistTag(raw: string): string {
  return raw
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*VEVO$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits collaboration credits such as "Lime & Flay!", "Lime and LilyPichu",
 * "Artist A, Artist B feat. Guest", while keeping band names containing "& the"
 * (e.g. "Richy Mitch & the Coal Miners", "KC & The Sunshine Band") intact.
 */
export function splitArtists(rawAuthor: string): string[] {
  const cleaned = cleanArtistTag(rawAuthor || "");
  if (!cleaned) return [];

  // Protect "& the" / "and the" band names before splitting
  const protectedBand = cleaned
    .replace(/\s+&\s+(the\b)/gi, " __AMP_THE__ $1")
    .replace(/\s+and\s+(the\b)/gi, " __AND_THE__ $1");

  const rawParts = protectedBand.split(
    /\s*(?:,|;|•|\/|&|\band\b|\bfeat\.|\bft\.|\bfeaturing\b|\bwith\b|×|\bx\b)\s*/i
  );

  const restored = rawParts
    .map((part) =>
      part
        .replace(/\s+__AMP_THE__\s+/g, " & ")
        .replace(/\s+__AND_THE__\s+/g, " and ")
        .trim()
    )
    .filter(Boolean);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of restored) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(name);
    }
  }

  return unique.length > 0 ? unique : [cleaned];
}
