import type { RouteSegment, Disruption, RmvHimMessage } from "./types";

const BASE_URL = "https://www.rmv.de/hapi";

class RmvApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "RmvApiError";
  }
}

function toRmvDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseRmvDateTime(date: string, time: string): string {
  // date: YYYYMMDD, time: HHMMSS
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
}

function lineMatchesSegment(himLine: string, segment: RouteSegment): boolean {
  const normalized = himLine.toLowerCase().replace(/\s/g, "");
  const target = segment.line.toLowerCase().replace(/\s/g, "");
  return normalized.includes(target) || normalized.endsWith(target);
}

function parseHimMessage(msg: RmvHimMessage, matchedLine: string): Disruption {
  return {
    himId: msg.himId,
    line: matchedLine,
    headline: msg.head,
    description: msg.lead ?? msg.text,
    validFrom: parseRmvDateTime(msg.sDate, msg.sTime),
    validTo: parseRmvDateTime(msg.eDate, msg.eTime),
    priority: msg.prio,
    category: msg.cat,
  };
}

function deduplicateDisruptions(disruptions: Disruption[]): Disruption[] {
  const seen = new Set<string>();
  return disruptions.filter((d) => {
    if (seen.has(d.himId)) return false;
    seen.add(d.himId);
    return true;
  });
}

async function queryHimSearch(
  dateB: string,
  dateE: string,
  apiKey: string
): Promise<RmvHimMessage[]> {
  const params = new URLSearchParams({
    accessId: apiKey,
    format: "json",
    dateB,
    dateE,
  });

  const url = `${BASE_URL}/himsearch?${params}`;

  if (process.env.DEBUG_RMV === "1") {
    console.log("[RMV] himsearch URL:", url);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

  if (!res.ok) {
    throw new RmvApiError(`himsearch failed: HTTP ${res.status}`, res.status);
  }

  const data = await res.json() as {
    errorCode?: string;
    errorText?: string;
    HimL?: Array<{ Him: RmvHimMessage }>;
  };

  if (process.env.DEBUG_RMV === "1") {
    console.log("[RMV] himsearch raw response:", JSON.stringify(data, null, 2));
  }

  if (data.errorCode) {
    throw new RmvApiError(`RMV API error: ${data.errorCode} — ${data.errorText}`);
  }

  return (data.HimL ?? []).map((entry) => entry.Him);
}

async function queryDepartureBoard(
  stopId: string,
  line: string,
  date: string,
  apiKey: string
): Promise<string[]> {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const params = new URLSearchParams({
    accessId: apiKey,
    format: "json",
    id: stopId,
    date,
    time,
    duration: "120",
    lines: line,
    maxJourneys: "3",
  });

  const res = await fetch(`${BASE_URL}/departureBoard?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return [];

  const data = await res.json() as {
    Departure?: Array<{ JourneyDetailRef?: { ref: string }; Messages?: { Message: Array<{ head: string; text: string }> } }>;
  };

  const messages: string[] = [];
  for (const dep of data.Departure ?? []) {
    for (const msg of dep.Messages?.Message ?? []) {
      messages.push(`${msg.head}: ${msg.text}`);
    }
  }
  return messages;
}

export async function fetchDisruptions(
  segments: RouteSegment[],
  apiKey: string
): Promise<Disruption[]> {
  const today = new Date();
  const lookahead = new Date(today);
  lookahead.setDate(lookahead.getDate() + 7);

  const dateB = toRmvDate(today);
  const dateE = toRmvDate(lookahead);

  let himMessages: RmvHimMessage[] = [];

  try {
    himMessages = await queryHimSearch(dateB, dateE, apiKey);
  } catch (err) {
    console.warn("[RMV] himsearch failed, falling back to departure board:", err);
  }

  const disruptions: Disruption[] = [];

  if (himMessages.length > 0) {
    for (const msg of himMessages) {
      const affectedLines = msg.affectedProducts?.map((p) => p.line) ?? [];

      for (const segment of segments) {
        const matchedLine = affectedLines.find((l) => lineMatchesSegment(l, segment));
        if (matchedLine) {
          disruptions.push(parseHimMessage(msg, segment.line));
          break;
        }
      }
    }
  } else {
    // Fallback: query departure boards for key stops
    const date = today.toISOString().slice(0, 10).replace(/-/g, "");
    const seen = new Set<string>();

    for (const segment of segments) {
      const key = `${segment.fromStopId}-${segment.line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        const msgs = await queryDepartureBoard(segment.fromStopId, segment.line, date, apiKey);
        for (const text of msgs) {
          disruptions.push({
            himId: `fallback-${segment.line}-${text.slice(0, 20)}`,
            line: segment.line,
            headline: text.split(":")[0] ?? text,
            description: text,
            validFrom: today.toISOString(),
            validTo: lookahead.toISOString(),
            priority: 2,
          });
        }
      } catch {
        // skip individual stop failures
      }
    }
  }

  return deduplicateDisruptions(disruptions);
}

export async function findStops(query: string, apiKey: string): Promise<Array<{ name: string; extId: string }>> {
  const params = new URLSearchParams({
    accessId: apiKey,
    format: "json",
    input: query,
    type: "S",
  });

  const res = await fetch(`${BASE_URL}/location.name?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new RmvApiError(`location.name failed: HTTP ${res.status}`);

  const data = await res.json() as {
    stopLocationOrCoordLocation?: Array<{
      StopLocation?: { name: string; extId: string };
    }>;
  };

  return (data.stopLocationOrCoordLocation ?? [])
    .map((entry) => entry.StopLocation)
    .filter((s): s is { name: string; extId: string } => s !== undefined);
}
