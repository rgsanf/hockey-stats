/**
 * NHL API client
 *
 * Architecture:
 * The NHL stats REST API splits skater data across multiple report endpoints:
 *   - skater/summary      → goals, assists, plusMinus, ppPoints, shPoints, shots, etc.
 *   - skater/realtime     → hits (and blocked shots, giveaways, etc.)
 *   - skater/faceoffpercentages → totalFaceoffs, faceoffWinPct (no direct faceoffWins)
 *
 * All players are fetched (no pagination). The API caps responses at 100 rows per
 * request, so fetchAllPages loops: fetches the first page to get `total`, then fires
 * all remaining pages in parallel. All fetches use Next.js cache (revalidate: 300).
 *
 * One endpoint is "primary" (drives sort order): summary for most fields, realtime
 * when sortBy === "hits". Secondary endpoints fetch all matching players with the
 * same filters and are merged by playerId.
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

const PAGE_SIZE = 100; // NHL API max rows per request

// ============================================================
// Internal fetch helpers
// ============================================================

/**
 * Fetches ALL matching records from a stats endpoint by paginating through every page.
 * Fires the first request to learn `total`, then fetches all remaining pages in parallel.
 * Sort is applied as given — use this for the primary endpoint to preserve sort order.
 */
async function fetchAllPages<T>(
  report: string,
  params: PlayersQueryParams,
  sort: string
): Promise<{ data: T[]; total: number }> {
  const makeUrl = (start: number) => {
    const url = new URL(`${NHL_STATS_BASE}/${report}`);
    url.searchParams.set("cayenneExp", buildCayenneExp(params));
    url.searchParams.set("factCayenneExp", buildFactCayenneExp());
    url.searchParams.set("isAggregate", "false");
    url.searchParams.set("isGame", "false");
    url.searchParams.set("sort", sort);
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(PAGE_SIZE));
    return url.toString();
  };

  const firstRes = await fetch(makeUrl(0), { next: { revalidate: 300 } });
  if (!firstRes.ok) {
    throw new NhlApiError(
      `NHL ${report} returned ${firstRes.status}: ${firstRes.statusText}`,
      firstRes.status
    );
  }
  const first = await firstRes.json() as { data: T[]; total: number };
  if (first.data.length >= first.total) return first;

  const remaining = Math.ceil((first.total - first.data.length) / PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: remaining }, (_, i) =>
      fetch(makeUrl((i + 1) * PAGE_SIZE), { next: { revalidate: 300 } }).then(
        (r) => r.ok ? (r.json() as Promise<{ data: T[] }>) : Promise.resolve({ data: [] as T[] })
      )
    )
  );

  const all = [...first.data, ...rest.flatMap((r) => r.data)];
  // The NHL API can return the same player on multiple pages when sort values are tied.
  // Deduplicate by playerId, keeping first occurrence to preserve sort order.
  const seen = new Set<number>();
  const deduped = all.filter((row) => {
    const id = (row as { playerId: number }).playerId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { data: deduped, total: first.total };
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
 * Fetches ALL player stats by querying three NHL API endpoints and merging by playerId.
 * Each endpoint is fully paginated (100 rows/request, all pages fetched).
 *
 * Primary endpoint (determines sort order):
 *   - skater/realtime  when sortBy === "hits"
 *   - skater/summary   for all other sort fields
 *
 * Secondary endpoints use the same filters but are sorted by playerId (order irrelevant
 * since they're merged into a Map).
 */
export async function fetchAllPlayerStats(params: PlayersQueryParams): Promise<{
  rows: MergedSkaterRow[];
  total: number;
}> {
  const primaryIsRealtime = REALTIME_SORT_FIELDS.has(params.sortBy);
  const primarySort = buildSortParam(params.sortBy, params.sortDir);
  const secondarySort = JSON.stringify([{ property: "playerId", direction: "ASC" }]);

  let summaryRows: NhlSkaterSummaryRow[];
  let realtimeRows: NhlSkaterRealtimeRow[];
  let faceoffRows: NhlSkaterFaceoffRow[];
  let total: number;

  if (primaryIsRealtime) {
    const [rt, sm, fo] = await Promise.all([
      fetchAllPages<NhlSkaterRealtimeRow>("skater/realtime", params, primarySort),
      fetchAllPages<NhlSkaterSummaryRow>("skater/summary", params, secondarySort),
      fetchAllPages<NhlSkaterFaceoffRow>("skater/faceoffpercentages", params, secondarySort),
    ]);
    realtimeRows = rt.data;
    total = rt.total;
    summaryRows = sm.data;
    faceoffRows = fo.data;
  } else {
    const [sm, rt, fo] = await Promise.all([
      fetchAllPages<NhlSkaterSummaryRow>("skater/summary", params, primarySort),
      fetchAllPages<NhlSkaterRealtimeRow>("skater/realtime", params, secondarySort),
      fetchAllPages<NhlSkaterFaceoffRow>("skater/faceoffpercentages", params, secondarySort),
    ]);
    summaryRows = sm.data;
    total = sm.total;
    realtimeRows = rt.data;
    faceoffRows = fo.data;
  }

  // Build lookup maps for O(1) joins
  const summaryMap = new Map(summaryRows.map((r) => [r.playerId, r]));
  const realtimeMap = new Map(realtimeRows.map((r) => [r.playerId, r]));
  const faceoffMap = new Map(faceoffRows.map((r) => [r.playerId, r]));

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

const RANK_FIELDS_BASE: (keyof MergedSkaterRow)[] = [
  "goals",
  "assists",
  "plusMinus",
  "ppPoints",
  "shPoints",
  "gameWinningGoals",
  "shots",
  "hits",
];

/**
 * Computes per-player overall quality scores from the full player list.
 * For each of 9 stat categories: score = player_value / category_max.
 * The category leader always gets 1.0; everyone else gets a proportional fraction.
 * Scores are summed across all categories — max possible OVR is 9.0.
 *
 * If the category max is <= 0 (e.g. every player has 0 or negative plusMinus),
 * that category is skipped to avoid division by zero or inverted scoring.
 */
export function computePlayerScores(allRows: MergedSkaterRow[], includeFW = true): PlayerScoreMap {
  const fields = includeFW ? [...RANK_FIELDS_BASE, "faceoffWins" as const] : RANK_FIELDS_BASE;
  const scores = new Map<number, number>(allRows.map((r) => [r.playerId, 0]));

  for (const field of fields) {
    const max = Math.max(...allRows.map((r) => r[field] as number));
    if (max <= 0) continue;

    for (const row of allRows) {
      const categoryScore = (row[field] as number) / max;
      scores.set(row.playerId, (scores.get(row.playerId) ?? 0) + categoryScore);
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
