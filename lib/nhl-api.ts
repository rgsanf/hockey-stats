/**
 * NHL API client
 *
 * Architecture:
 * The NHL stats REST API splits skater data across multiple report endpoints:
 *   - skater/summary      → goals, assists, plusMinus, ppPoints, shPoints, shots, etc.
 *   - skater/realtime     → hits (and blocked shots, giveaways, etc.)
 *   - skater/faceoffpercentages → totalFaceoffs, faceoffWinPct (no direct faceoffWins)
 *
 * Performance strategy:
 * 1. One endpoint is "primary" — it determines which N players appear on the page
 *    and drives sorting. Summary is primary for all fields except hits.
 *    Realtime is primary when sortBy === "hits".
 * 2. The other two endpoints are "secondary" — they fetch data for ONLY the playerIds
 *    returned by the primary, using `playerId in (id1,id2,...)` in cayenneExp.
 *    This limits secondary fetches to at most pageSize rows (10–50 players), never all 900.
 * 3. All three fetches happen in parallel where possible.
 * 4. `next: { revalidate: 300 }` on every fetch — Next.js caches raw NHL API responses
 *    for 5 minutes, so repeated calls with the same URL are served from cache.
 * 5. Player positions from the landing endpoint are cached in a module-level Map
 *    that persists across requests in the same worker process. Only called for players
 *    where positionCode is null in ALL three endpoints (very rare in practice).
 */

import type {
  MergedSkaterRow,
  NhlSkaterFaceoffRow,
  NhlSkaterRealtimeRow,
  NhlSkaterSummaryRow,
  PlayerScoreMap,
  PlayersQueryParams,
} from "@/lib/types";
import { buildCayenneExp, buildFactCayenneExp, buildSortParam } from "@/lib/mappers";

// Module-level position cache — persists across requests in the same process
const positionCache = new Map<number, string>();

const NHL_STATS_BASE = "https://api.nhle.com/stats/rest/en";
const NHL_WEB_BASE = "https://api-web.nhle.com/v1";

// The sort field that routes to the realtime endpoint rather than summary
const REALTIME_SORT_FIELDS = new Set(["hits"]);

// ============================================================
// Internal fetch helpers
// ============================================================

/** Fetch all matching players from a stats endpoint (no pagination). */
async function fetchPage<T>(
  report: string,
  params: PlayersQueryParams
): Promise<{ data: T[]; total: number }> {
  const url = new URL(`${NHL_STATS_BASE}/${report}`);
  url.searchParams.set("cayenneExp", buildCayenneExp(params));
  url.searchParams.set("factCayenneExp", buildFactCayenneExp());
  url.searchParams.set("isAggregate", "false");
  url.searchParams.set("isGame", "false");
  url.searchParams.set("sort", buildSortParam(params.sortBy, params.sortDir));
  url.searchParams.set("start", "0");
  url.searchParams.set("limit", "2000");

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new NhlApiError(
      `NHL ${report} returned ${res.status}: ${res.statusText}`,
      res.status
    );
  }
  return res.json();
}

/** Fetch a stats endpoint filtered to specific playerIds (secondary/enrichment fetch). */
async function fetchByIds<T>(
  report: string,
  season: string,
  playerIds: number[]
): Promise<{ data: T[] }> {
  if (playerIds.length === 0) return { data: [] };

  const url = new URL(`${NHL_STATS_BASE}/${report}`);
  url.searchParams.set(
    "cayenneExp",
    `seasonId=${season} and playerId in (${playerIds.join(",")})`
  );
  url.searchParams.set("factCayenneExp", "gamesPlayed>=0");
  url.searchParams.set("isAggregate", "false");
  url.searchParams.set("isGame", "false");
  url.searchParams.set(
    "sort",
    JSON.stringify([{ property: "playerId", direction: "ASC" }])
  );
  url.searchParams.set("start", "0");
  url.searchParams.set("limit", String(playerIds.length));

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) return { data: [] }; // Don't fail the whole request for enrichment failures
  return res.json();
}

// ============================================================
// Position enrichment
// ============================================================

/** Fetch a single player's position from the landing endpoint. */
async function fetchPlayerPosition(playerId: number): Promise<string | null> {
  try {
    const res = await fetch(`${NHL_WEB_BASE}/player/${playerId}/landing`, {
      next: { revalidate: 3600 }, // positions rarely change — cache 1 hour
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as { position?: string }).position ?? null;
  } catch {
    return null;
  }
}

/**
 * Enriches merged rows that have null positionCode by calling the landing endpoint.
 * Only fetches for true cache misses — typically 0 per request.
 */
async function enrichMergedPositions(rows: MergedSkaterRow[]): Promise<void> {
  const missing = rows.filter(
    (r) => !r.positionCode && !positionCache.has(r.playerId)
  );
  if (missing.length === 0) {
    // Apply any cached positions for players that were null this page
    for (const row of rows) {
      if (!row.positionCode && positionCache.has(row.playerId)) {
        row.positionCode = positionCache.get(row.playerId)!;
      }
    }
    return;
  }

  await Promise.all(
    missing.map(async (row) => {
      const pos = await fetchPlayerPosition(row.playerId);
      if (pos) {
        positionCache.set(row.playerId, pos);
        row.positionCode = pos;
      }
    })
  );

  // Apply cache to any remaining nulls
  for (const row of rows) {
    if (!row.positionCode && positionCache.has(row.playerId)) {
      row.positionCode = positionCache.get(row.playerId)!;
    }
  }
}

// ============================================================
// Public unified fetch
// ============================================================

/**
 * Fetches all player stats needed for one page by querying three NHL API endpoints
 * and merging the results by playerId.
 *
 * Primary endpoint (determines pagination + sort order):
 *   - skater/realtime  when sortBy === "hits"
 *   - skater/summary   for all other sort fields
 *
 * Secondary endpoints (fetched for the current page's playerIds only):
 *   - The non-primary summary/realtime endpoint
 *   - skater/faceoffpercentages (always secondary — faceoffWins is derived, not sortable)
 */
export async function fetchAllPlayerStats(params: PlayersQueryParams): Promise<{
  rows: MergedSkaterRow[];
  total: number;
}> {
  const primaryIsRealtime = REALTIME_SORT_FIELDS.has(params.sortBy);

  let summaryRows: NhlSkaterSummaryRow[];
  let realtimeRows: NhlSkaterRealtimeRow[];
  let total: number;

  let ff: { data: NhlSkaterFaceoffRow[] };

  if (primaryIsRealtime) {
    // Primary: realtime (user sorted by hits)
    const rt = await fetchPage<NhlSkaterRealtimeRow>("skater/realtime", params);
    realtimeRows = rt.data;
    total = rt.total;

    const playerIds = realtimeRows.map((r) => r.playerId);
    // Fetch summary and faceoffs in parallel for this page's players
    const [sm, fo] = await Promise.all([
      fetchByIds<NhlSkaterSummaryRow>("skater/summary", params.season, playerIds),
      fetchByIds<NhlSkaterFaceoffRow>("skater/faceoffpercentages", params.season, playerIds),
    ]);
    summaryRows = sm.data;
    ff = fo;
  } else {
    // Primary: summary
    const sm = await fetchPage<NhlSkaterSummaryRow>("skater/summary", params);
    summaryRows = sm.data;
    total = sm.total;

    const playerIds = summaryRows.map((r) => r.playerId);
    // Fetch realtime and faceoffs in parallel for this page's players
    const [rt, fo] = await Promise.all([
      fetchByIds<NhlSkaterRealtimeRow>("skater/realtime", params.season, playerIds),
      fetchByIds<NhlSkaterFaceoffRow>("skater/faceoffpercentages", params.season, playerIds),
    ]);
    realtimeRows = rt.data;
    ff = fo;
  }

  // Build lookup maps for O(1) joins
  const summaryMap = new Map(summaryRows.map((r) => [r.playerId, r]));
  const realtimeMap = new Map(realtimeRows.map((r) => [r.playerId, r]));
  const faceoffMap = new Map(ff.data.map((r) => [r.playerId, r]));

  // Preserve primary endpoint's order
  const orderedIds = primaryIsRealtime
    ? realtimeRows.map((r) => r.playerId)
    : summaryRows.map((r) => r.playerId);

  // Merge in primary endpoint's order
  const rows: MergedSkaterRow[] = orderedIds.map((playerId) => {
    const s = summaryMap.get(playerId);
    const rt = realtimeMap.get(playerId);
    const fo = faceoffMap.get(playerId);
    const faceoffWins = fo
      ? Math.round(fo.totalFaceoffs * fo.faceoffWinPct)
      : 0;

    return {
      playerId,
      skaterFullName: s?.skaterFullName ?? rt?.skaterFullName ?? "Unknown",
      teamAbbrevs: s?.teamAbbrevs ?? rt?.teamAbbrevs ?? "",
      // Use first non-null positionCode across endpoints
      positionCode: s?.positionCode ?? rt?.positionCode ?? null,
      gamesPlayed: s?.gamesPlayed ?? rt?.gamesPlayed ?? 0,
      goals: s?.goals ?? 0,
      assists: s?.assists ?? 0,
      plusMinus: s?.plusMinus ?? 0,
      ppPoints: s?.ppPoints ?? 0,
      shPoints: s?.shPoints ?? 0,
      gameWinningGoals: s?.gameWinningGoals ?? 0,
      shots: s?.shots ?? 0,
      hits: rt?.hits ?? 0,
      faceoffWins,
    };
  });

  // Enrich any remaining null positions from the landing endpoint (usually none)
  await enrichMergedPositions(rows);

  return { rows, total };
}

// ============================================================
// Overall quality score computation
// ============================================================

const RANK_FIELDS: (keyof MergedSkaterRow)[] = [
  "goals",
  "assists",
  "plusMinus",
  "ppPoints",
  "shPoints",
  "gameWinningGoals",
  "shots",
  "faceoffWins",
  "hits",
];

/**
 * Computes per-player overall quality scores from the full player list.
 * For each of 9 stat categories, assigns rank (1 = best, ties share minimum rank)
 * and accumulates score = 1 - rank/N per category. Max possible score ≈ 9.0.
 */
export function computePlayerScores(allRows: MergedSkaterRow[]): PlayerScoreMap {
  const N = allRows.length;
  const scores = new Map<number, number>(allRows.map((r) => [r.playerId, 0]));

  for (const field of RANK_FIELDS) {
    const sorted = allRows.slice().sort(
      (a, b) => (b[field] as number) - (a[field] as number)
    );

    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][field] !== sorted[i - 1][field]) {
        rank = i + 1;
      }
      const categoryScore = 1 - rank / N;
      scores.set(sorted[i].playerId, (scores.get(sorted[i].playerId) ?? 0) + categoryScore);
    }
  }

  return scores;
}

/** Custom error class so callers can distinguish NHL API failures. */
export class NhlApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "NhlApiError";
  }
}
