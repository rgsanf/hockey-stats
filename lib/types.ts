// ============================================================
// Raw NHL API shapes
// ============================================================

/** One row from https://api.nhle.com/stats/rest/en/skater/summary */
export interface NhlSkaterSummaryRow {
  playerId: number;
  skaterFullName: string;
  /** Single team or comma-separated for traded players, e.g. "TOR" or "TOR,MTL" (chronological) */
  teamAbbrevs: string;
  /** Position code — present for most players but can be null */
  positionCode: string | null;
  goals: number;
  assists: number;
  plusMinus: number;
  /** Power play points — field name in the API is ppPoints, NOT powerPlayPoints */
  ppPoints: number;
  /** Short-handed points — field name in the API is shPoints, NOT shortHandedPoints */
  shPoints: number;
  gameWinningGoals: number;
  shots: number;
  gamesPlayed: number;
}

export interface NhlSkaterSummaryResponse {
  data: NhlSkaterSummaryRow[];
  total: number;
}

/** One row from https://api.nhle.com/stats/rest/en/skater/realtime */
export interface NhlSkaterRealtimeRow {
  playerId: number;
  skaterFullName: string;
  teamAbbrevs: string;
  positionCode: string | null;
  hits: number;
  gamesPlayed: number;
}

export interface NhlSkaterRealtimeResponse {
  data: NhlSkaterRealtimeRow[];
  total: number;
}

/** One row from https://api.nhle.com/stats/rest/en/skater/faceoffpercentages */
export interface NhlSkaterFaceoffRow {
  playerId: number;
  totalFaceoffs: number;
  faceoffWinPct: number;
}

export interface NhlSkaterFaceoffResponse {
  data: NhlSkaterFaceoffRow[];
  total: number;
}

/** Relevant fields from https://api-web.nhle.com/v1/player/{id}/landing */
export interface NhlPlayerLandingResponse {
  playerId: number;
  position: string;
}

// ============================================================
// Merged row (internal — combined from all 3 endpoints)
// ============================================================

export interface MergedSkaterRow {
  playerId: number;
  skaterFullName: string;
  teamAbbrevs: string;
  positionCode: string | null;
  gamesPlayed: number;
  goals: number;
  assists: number;
  plusMinus: number;
  ppPoints: number;
  shPoints: number;
  gameWinningGoals: number;
  shots: number;
  hits: number;
  faceoffWins: number;
}

// ============================================================
// Internal API contracts (frontend ↔ /api/players)
// ============================================================

export interface PlayerRow {
  playerId: number;
  name: string;
  /** Position code, e.g. "C", "L", "R", "D" — "—" if unknown */
  position: string;
  /** Most recent team abbreviation */
  team: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  plusMinus: number;
  powerPlayPoints: number;
  shortHandedPoints: number;
  gameWinningGoals: number;
  /** Shots on goal */
  shots: number;
  faceoffWins: number;
  hits: number;
  /** Computed overall quality score: sum of per-category rank scores across 9 stat categories */
  overallScore: number;
  /** Bell-curve grade based on OVR percentile among all NHL players: S/A/B/C/D/F */
  grade: string;
}

export interface GradeThreshold {
  cutS: number;
  cutA: number;
  cutB: number;
  cutC: number;
  cutD: number;
}

export interface PlayersApiResponse {
  rows: PlayerRow[];
  total: number;
  /** Per-stat grade thresholds computed from all NHL players, keyed by PlayerRow field name. */
  thresholds: Record<string, GradeThreshold>;
}

/** Maps playerId → computed overall quality score (0–9.0 range). */
export type PlayerScoreMap = Map<number, number>;

export type SortDirection = "ASC" | "DESC";

export interface PlayersQueryParams {
  season: string;
  sortBy: string;
  sortDir: SortDirection;
  search?: string;
  position?: string;
  team?: string;
}

// ============================================================
// UI helpers
// ============================================================

export interface SeasonOption {
  value: string;
  label: string;
}

export interface ColumnDef {
  key: keyof PlayerRow;
  header: string;
  sortable: boolean;
  align: "left" | "center" | "right";
  minWidth?: string;
}
