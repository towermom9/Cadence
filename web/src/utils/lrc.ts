export interface SyncedWord {
  timeMs: number;
  text: string;
}

export interface SyncedLine {
  timeMs: number;
  text: string;
  words?: SyncedWord[];
}

export function toTimestampMs(minStr: string, secStr: string, fracStr?: string): number {
  const min = Number(minStr);
  const sec = Number(secStr);
  const frac = fracStr ? Number(fracStr.padEnd(3, "0").slice(0, 3)) : 0;
  return min * 60_000 + sec * 1000 + frac;
}

export function stripInlineTags(raw: string): string {
  return raw
    .replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "");
}

export function parseEnhancedBody(
  body: string,
  lineTimeMs: number,
  offsetMs: number
): { text: string; words?: SyncedWord[] } {
  const inlineRegex = /<(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?>/g;
  if (!inlineRegex.test(body)) {
    const clean = body.trim() || "♪";
    return { text: clean };
  }

  inlineRegex.lastIndex = 0;
  const words: SyncedWord[] = [];
  let lastIdx = 0;
  let activeTime = lineTimeMs;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(body)) !== null) {
    const chunk = body.slice(lastIdx, match.index);
    const cleaned = chunk.replace(/\s+/g, " ").trim();
    if (cleaned) {
      words.push({ timeMs: activeTime, text: cleaned });
    }
    activeTime = Math.max(0, toTimestampMs(match[1], match[2], match[3]) - offsetMs);
    lastIdx = match.index + match[0].length;
  }

  const tail = body.slice(lastIdx).replace(/\s+/g, " ").trim();
  if (tail) {
    words.push({ timeMs: activeTime, text: tail });
  }

  const plain = words.map((w) => w.text).join(" ").trim() || "♪";
  return words.length > 0 ? { text: plain, words } : { text: plain };
}

export function parseSyncedLyrics(raw: string | null | undefined): SyncedLine[] {
  if (!raw) return [];
  const rawLines = raw.split(/\r?\n/);

  let offsetMs = 0;
  for (const l of rawLines) {
    const om = l.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (om) {
      offsetMs = Number(om[1]) || 0;
      break;
    }
  }

  const lines: SyncedLine[] = [];
  const prefixPattern = /^((?:\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]\s*)+)(.*)$/;
  const singleTagPattern = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of rawLines) {
    const match = rawLine.match(prefixPattern);
    if (!match) continue;
    const tagBlock = match[1];
    const body = match[2] ?? "";

    singleTagPattern.lastIndex = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = singleTagPattern.exec(tagBlock)) !== null) {
      const timeMs = Math.max(
        0,
        toTimestampMs(tagMatch[1], tagMatch[2], tagMatch[3]) - offsetMs
      );
      const parsed = parseEnhancedBody(body, timeMs, offsetMs);
      lines.push({ timeMs, text: parsed.text, words: parsed.words });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}
