import type {
  MergedSkaterRow,
  PlayerRow,
  PlayerScoreMap,
  PlayersQueryParams,
  SeasonOption,
  SortDirection,
  ColumnDef,
} from "@/lib/types";

// ============================================================
// NHL API query parameter builders
// ============================================================

/**
 * Builds the `cayenneExp` filter string for the NHL stats API.
 * The season filter is always required; others are appended as needed.
 */
export function buildCayenneExp(params: PlayersQueryParams): string {
  const parts: string[] = [`seasonId=${params.season}`];

  if (params.search?.trim()) {
    const escaped = params.search.trim().replace(/"/g, "");
    parts.push(`skaterFullName likeIgnoreCase "%${escaped}%"`);
  }

  if (params.position) {
    parts.push(`positionCode="${params.position}"`);
  }

  if (params.team) {
    // Use LIKE because traded players have comma-separated values like "TOR,MTL"
    const escaped = params.team.replace(/"/g, "");
    parts.push(`teamAbbrevs likeIgnoreCase "%${escaped}%"`);
  }

  return parts.join(" and ");
}

/**
 * Builds the `factCayenneExp` filter.
 * Required by the endpoint — we require at least 1 game played.
 */
export function buildFactCayenneExp(): string {
  return "gamesPlayed>=1";
}

/**
 * Builds the `sort` parameter (JSON array) for the NHL stats API.
 * Maps UI field names to API field names where they differ.
 */
export function buildSortParam(sortBy: string, sortDir: SortDirection): string {
  const fieldMap: Record<string, string> = {
    name: "skaterFullName",
    gamesPlayed: "gamesPlayed",
    goals: "goals",
    assists: "assists",
    plusMinus: "plusMinus",
    powerPlayPoints: "ppPoints",
    shortHandedPoints: "shPoints",
    gameWinningGoals: "gameWinningGoals",
    shots: "shots",
    hits: "hits", // used when realtime is the primary endpoint
  };

  const apiField = fieldMap[sortBy] ?? "goals";
  return JSON.stringify([{ property: apiField, direction: sortDir }]);
}

// ============================================================
// Data transformation: MergedSkaterRow → PlayerRow
// ============================================================

/**
 * Returns the most recent team abbreviation.
 * Traded players have comma-separated values like "TOR,MTL" (chronological).
 * We take the last entry as the current team.
 */
export function parseTeamAbbrev(teamAbbrevs: string): string {
  if (!teamAbbrevs) return "—";
  const teams = teamAbbrevs.split(",").map((t) => t.trim());
  // Last entry is the most recent team
  return teams[teams.length - 1];
}

/** Maps a merged row to the UI-facing PlayerRow shape. */
export function mapMergedRowToPlayerRow(row: MergedSkaterRow, overallScore = 0): PlayerRow {
  return {
    playerId: row.playerId,
    name: row.skaterFullName,
    position: row.positionCode ?? "—",
    team: parseTeamAbbrev(row.teamAbbrevs),
    gamesPlayed: row.gamesPlayed ?? 0,
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    plusMinus: row.plusMinus ?? 0,
    // Use ppPoints / shPoints directly from the API — NOT goals+ppGoals (that would double-count)
    powerPlayPoints: row.ppPoints ?? 0,
    shortHandedPoints: row.shPoints ?? 0,
    gameWinningGoals: row.gameWinningGoals ?? 0,
    shots: row.shots ?? 0,
    // faceoffWins is computed: Math.round(totalFaceoffs * faceoffWinPct)
    faceoffWins: row.faceoffWins ?? 0,
    hits: row.hits ?? 0,
    overallScore,
  };
}

/** Maps an array of merged rows to PlayerRow[]. */
export function mapMergedRowsToPlayerRows(rows: MergedSkaterRow[], scoreMap?: PlayerScoreMap): PlayerRow[] {
  return rows.map((row) => mapMergedRowToPlayerRow(row, scoreMap?.get(row.playerId) ?? 0));
}

// ============================================================
// Season helpers
// ============================================================

/**
 * Builds the list of season options for the season selector.
 * referenceYear should be the calendar year we're currently in.
 * Generates 8 seasons going back from the most recent.
 */
export function buildSeasonOptions(referenceYear: number): SeasonOption[] {
  const options: SeasonOption[] = [];
  for (let startYear = referenceYear - 1; startYear >= referenceYear - 8; startYear--) {
    options.push({
      value: `${startYear}${startYear + 1}`,
      label: `${startYear}–${String(startYear + 1).slice(2)}`,
    });
  }
  return options;
}

/**
 * Returns the current NHL season string (e.g. "20252026").
 * The season starts in October — before October we're still in the previous season.
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 10 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

// ============================================================
// Column definitions
// ============================================================

export const COLUMN_DEFS: ColumnDef[] = [
  { key: "name", header: "Player", sortable: true, align: "left", minWidth: "160px" },
  { key: "position", header: "Pos", sortable: false, align: "center" },
  { key: "team", header: "Team", sortable: false, align: "center" },
  { key: "gamesPlayed", header: "GP", sortable: true, align: "right" },
  { key: "goals", header: "G", sortable: true, align: "right" },
  { key: "assists", header: "A", sortable: true, align: "right" },
  { key: "plusMinus", header: "+/-", sortable: true, align: "right" },
  { key: "powerPlayPoints", header: "PPP", sortable: true, align: "right" },
  { key: "shortHandedPoints", header: "SHP", sortable: true, align: "right" },
  { key: "gameWinningGoals", header: "GWG", sortable: true, align: "right" },
  { key: "shots", header: "SOG", sortable: true, align: "right" },
  { key: "faceoffWins", header: "FW", sortable: true, align: "right" },
  { key: "hits", header: "HIT", sortable: true, align: "right" },
  { key: "overallScore", header: "OVR", sortable: true, align: "right" },
];

export const VALID_SORT_FIELDS = new Set(
  COLUMN_DEFS.filter((c) => c.sortable).map((c) => c.key as string)
);

export const POSITIONS = ["C", "L", "R", "D"] as const;
export type Position = (typeof POSITIONS)[number];
