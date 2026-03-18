import { NextResponse } from "next/server";
import { fetchAllPlayerStats, computePlayerScores, NhlApiError } from "@/lib/nhl-api";
import { mapMergedRowsToPlayerRows, VALID_SORT_FIELDS, getCurrentSeason } from "@/lib/mappers";
import type { PlayersApiResponse, PlayersQueryParams, SortDirection } from "@/lib/types";

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
    // Fetch all players (no pagination). Compute OVR scores from the full dataset.
    const { rows: mergedRows, total } = await fetchAllPlayerStats(params);
    const scoreMap = computePlayerScores(mergedRows);
    const rows = mapMergedRowsToPlayerRows(mergedRows, scoreMap);

    // faceoffWins and overallScore are computed fields — sort client-side after mapping.
    if (params.sortBy === "faceoffWins" || params.sortBy === "overallScore") {
      const field = params.sortBy;
      const dir = params.sortDir === "DESC" ? -1 : 1;
      rows.sort((a, b) => dir * ((a[field] as number) - (b[field] as number)));
    }

    const response: PlayersApiResponse = { rows, total };

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
