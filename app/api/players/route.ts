import { NextResponse } from "next/server";
import { fetchAllPlayerStats, computePlayerScores, NhlApiError } from "@/lib/nhl-api";
import { mapMergedRowsToPlayerRows, VALID_SORT_FIELDS, getCurrentSeason } from "@/lib/mappers";
import type { GradeThreshold, PlayersApiResponse, PlayersQueryParams, SortDirection } from "@/lib/types";

const VALID_SORT_DIRS = new Set<string>(["ASC", "DESC"]);
const VALID_POSITIONS = new Set(["C", "L", "R", "D", "G"]);

/** Parse and validate query params, applying sensible defaults. */
function parseParams(
  searchParams: URLSearchParams
): PlayersQueryParams | { error: string; status: number } {
  const season = searchParams.get("season") || getCurrentSeason();
  if (!/^\d{8}$/.test(season)) {
    return {
      error: `Invalid season format: "${season}". Expected 8 digits e.g. "20252026".`,
      status: 400,
    };
  }

  const sortBy = searchParams.get("sortBy") || "goals";
  if (!VALID_SORT_FIELDS.has(sortBy)) {
    return { error: `Invalid sortBy: "${sortBy}".`, status: 400 };
  }

  const rawSortDir = (searchParams.get("sortDir") || "DESC").toUpperCase();
  if (!VALID_SORT_DIRS.has(rawSortDir)) {
    return {
      error: `Invalid sortDir: "${rawSortDir}". Must be "ASC" or "DESC".`,
      status: 400,
    };
  }

  const position = searchParams.get("position") || undefined;
  if (position && !VALID_POSITIONS.has(position)) {
    return { error: `Invalid position: "${position}".`, status: 400 };
  }

  return {
    season,
    sortBy,
    sortDir: rawSortDir as SortDirection,
    search: searchParams.get("search") || undefined,
    position,
    team: searchParams.get("team") || undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const paramsOrError = parseParams(searchParams);

  if ("error" in paramsOrError) {
    return NextResponse.json(
      { error: paramsOrError.error },
      { status: paramsOrError.status }
    );
  }

  const params = paramsOrError;

  try {
    // OVR must be stable regardless of sort or filters — always compute from the full
    // unfiltered season dataset with summary as primary (goals sort). This ensures N
    // is consistent and every player is ranked against all NHL players, not a subset.
    const ovrParams: PlayersQueryParams = { season: params.season, sortBy: "goals", sortDir: "DESC" };

    const [{ rows: mergedRows, total }, { rows: ovrRows }] = await Promise.all([
      fetchAllPlayerStats(params),
      fetchAllPlayerStats(ovrParams),
    ]);

    const includeFW = searchParams.get("includeFW") !== "0";
    const scoreMap = computePlayerScores(ovrRows, includeFW);
    const rows = mapMergedRowsToPlayerRows(mergedRows, scoreMap);

    // Compute grade thresholds for each stat category from all NHL players.
    // Cutoffs correspond to bell-curve percentile bands: S/A/B/C/D/F.
    const threshold = (vals: number[]): GradeThreshold => {
      const sorted = vals.slice().sort((a, b) => b - a);
      const N = sorted.length;
      return {
        cutS: sorted[Math.floor(N * 0.023)] ?? 0,
        cutA: sorted[Math.floor(N * 0.159)] ?? 0,
        cutB: sorted[Math.floor(N * 0.500)] ?? 0,
        cutC: sorted[Math.floor(N * 0.841)] ?? 0,
        cutD: sorted[Math.floor(N * 0.977)] ?? 0,
      };
    };

    const thresholds: Record<string, GradeThreshold> = {
      goals:             threshold(ovrRows.map((r) => r.goals)),
      assists:           threshold(ovrRows.map((r) => r.assists)),
      plusMinus:         threshold(ovrRows.map((r) => r.plusMinus)),
      powerPlayPoints:   threshold(ovrRows.map((r) => r.ppPoints)),
      shortHandedPoints: threshold(ovrRows.map((r) => r.shPoints)),
      gameWinningGoals:  threshold(ovrRows.map((r) => r.gameWinningGoals)),
      shots:             threshold(ovrRows.map((r) => r.shots)),
      faceoffWins:       threshold(ovrRows.map((r) => r.faceoffWins)),
      hits:              threshold(ovrRows.map((r) => r.hits)),
      overallScore:      threshold(Array.from(scoreMap.values())),
    };

    const gradeForScore = (s: number) => {
      const t = thresholds.overallScore;
      return s >= t.cutS ? "S" : s >= t.cutA ? "A" : s >= t.cutB ? "B" : s >= t.cutC ? "C" : s >= t.cutD ? "D" : "F";
    };
    for (const row of rows) row.grade = gradeForScore(row.overallScore);

    // faceoffWins and overallScore are computed fields — sort client-side after mapping.
    if (params.sortBy === "faceoffWins" || params.sortBy === "overallScore") {
      const field = params.sortBy;
      const dir = params.sortDir === "DESC" ? -1 : 1;
      rows.sort((a, b) => dir * ((a[field] as number) - (b[field] as number)));
    }

    const response: PlayersApiResponse = { rows, total, thresholds };

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof NhlApiError) {
      console.error("[/api/players] NHL API error:", err.message);
      return NextResponse.json(
        { error: "Failed to fetch player data from the NHL API. Please try again." },
        { status: 502 }
      );
    }

    console.error("[/api/players] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
