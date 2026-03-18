"use client";

import { LoadingSkeleton } from "@/components/loading-skeleton";
import { TableFilters } from "@/components/table-filters";
import { COLUMN_DEFS } from "@/lib/mappers";
import type {
  GradeThreshold,
  PlayerRow,
  PlayersApiResponse,
} from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

// -------------------------------------------------------
// Grade helpers
// -------------------------------------------------------

const GRADE_COLORS: Record<string, string> = {
  S: "text-yellow-500 dark:text-yellow-400 font-bold",
  A: "text-green-600 dark:text-green-400 font-bold",
  B: "text-blue-600 dark:text-blue-400 font-semibold",
  C: "text-gray-500 dark:text-gray-400",
  D: "text-orange-500 dark:text-orange-400",
  F: "text-red-600 dark:text-red-400",
};

function getGrade(value: number, t: GradeThreshold): string {
  if (value >= t.cutS) return "S";
  if (value >= t.cutA) return "A";
  if (value >= t.cutB) return "B";
  if (value >= t.cutC) return "C";
  if (value >= t.cutD) return "D";
  return "F";
}

// -------------------------------------------------------
// Sort indicator
// -------------------------------------------------------

function SortIcon({ active, dir }: { active: boolean; dir: "ASC" | "DESC" }) {
  if (!active) return <span className="ml-1 text-gray-400 text-xs">⇅</span>;
  return (
    <span className="ml-1 text-blue-500 text-xs">
      {dir === "ASC" ? "▲" : "▼"}
    </span>
  );
}

// -------------------------------------------------------
// Main table component
// -------------------------------------------------------

export function PlayersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<PlayersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [showGrade, setShowGrade] = useState(false);

  const sortBy = searchParams.get("sortBy") || "goals";
  const sortDir = (searchParams.get("sortDir") || "DESC") as "ASC" | "DESC";
  const includeFW = searchParams.get("includeFW") !== "0";

  const paramsString = searchParams.toString();

  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/players?${paramsString}`, { signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ||
              `Request failed (${res.status})`,
          );
        }
        const json = (await res.json()) as PlayersApiResponse;
        setData(json);
        const teams = Array.from(
          new Set(
            json.rows
              .map((r) => r.team)
              .filter((t) => t && !t.includes("Teams")),
          ),
        ).sort();
        setAvailableTeams(teams);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to load player data.");
      } finally {
        setLoading(false);
      }
    },
    [paramsString],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  function pushParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    startTransition(() => router.push(`/players?${next.toString()}`));
  }

  function handleSort(columnKey: string) {
    const newDir = sortBy === columnKey && sortDir === "DESC" ? "ASC" : "DESC";
    pushParams({ sortBy: columnKey, sortDir: newDir });
  }

  const showSkeleton = loading && !data;
  const showOverlay = isPending || (loading && !!data);

  return (
    <div className="space-y-3">
      {/* Filters + grade toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <TableFilters availableTeams={availableTeams} />
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showGrade}
            onChange={(e) => setShowGrade(e.target.checked)}
            className="cursor-pointer"
          />
          Grades
        </label>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={() => {
              const c = new AbortController();
              fetchData(c.signal);
            }}
            className="shrink-0 font-medium underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="relative rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {showOverlay && !showSkeleton && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-950/50 z-20 pointer-events-none" />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {COLUMN_DEFS.map((col) => {
                  const isActive = sortBy === col.key;
                  const canSort = col.sortable;
                  return (
                    <th
                      key={col.key as string}
                      className={[
                        "px-3 py-2.5 font-semibold text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 select-none whitespace-nowrap relative",
                        col.align === "left"
                          ? "text-left"
                          : col.align === "right"
                            ? "text-right"
                            : "text-center",
                        col.minWidth ? `min-w-[${col.minWidth}]` : "",
                        canSort
                          ? "cursor-pointer hover:text-gray-800 dark:hover:text-gray-100"
                          : "",
                        isActive ? "text-blue-600 dark:text-blue-400" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={
                        canSort
                          ? () => handleSort(col.key as string)
                          : undefined
                      }
                      aria-sort={
                        isActive
                          ? sortDir === "ASC"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {col.header}
                      {canSort && <SortIcon active={isActive} dir={sortDir} />}
                      {col.key === "overallScore" && (
                        <div
                          className="flex items-center justify-end gap-1 mt-0.5 font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            id="fw-toggle"
                            type="checkbox"
                            checked={includeFW}
                            onChange={(e) =>
                              pushParams({
                                includeFW: e.target.checked ? "1" : "0",
                              })
                            }
                            className="cursor-pointer"
                          />
                          <label
                            htmlFor="fw-toggle"
                            className="cursor-pointer text-xs"
                          >
                            FW
                          </label>
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {showSkeleton ? (
                <LoadingSkeleton rows={25} columns={COLUMN_DEFS.length} />
              ) : !error && data?.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMN_DEFS.length}
                    className="px-3 py-12 text-center text-gray-400 dark:text-gray-500"
                  >
                    No players match your search.
                  </td>
                </tr>
              ) : (
                data?.rows.map((player) => (
                  <PlayerRowItem
                    key={player.playerId}
                    player={player}
                    showGrade={showGrade}
                    thresholds={data.thresholds}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {data.rows.length} players
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Row component
// -------------------------------------------------------

function PlayerRowItem({
  player,
  showGrade,
  thresholds,
}: {
  player: PlayerRow;
  showGrade: boolean;
  thresholds: Record<string, GradeThreshold>;
}) {
  const numCell =
    "px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300";

  // Renders a stat cell: grade letter (colored) when showGrade, raw value otherwise.
  const statCell = (value: number, field: string, display?: string) => {
    if (showGrade && thresholds[field]) {
      const grade = getGrade(value, thresholds[field]);
      return (
        <td className={`px-3 py-2.5 text-right ${GRADE_COLORS[grade] ?? ""}`}>
          {grade}
        </td>
      );
    }
    return <td className={numCell}>{display ?? value}</td>;
  };

  const signed = player.plusMinus > 0 ? "+" : "";

  // plusMinus has special raw display (color + sign), but grade mode just shows letter
  const plusMinusCell = () => {
    if (showGrade && thresholds.plusMinus) {
      const grade = getGrade(player.plusMinus, thresholds.plusMinus);
      return (
        <td className={`px-3 py-2.5 text-right ${GRADE_COLORS[grade] ?? ""}`}>
          {grade}
        </td>
      );
    }
    return (
      <td
        className={`${numCell} ${
          player.plusMinus > 0
            ? "text-green-600 dark:text-green-400"
            : player.plusMinus < 0
              ? "text-red-500 dark:text-red-400"
              : ""
        }`}
      >
        {signed}
        {player.plusMinus}
      </td>
    );
  };

  // OVR cell: use pre-computed player.grade (based on OVR thresholds) in grade mode
  const ovrCell = () => {
    if (showGrade) {
      return (
        <td
          className={`px-3 py-2.5 text-right ${GRADE_COLORS[player.grade] ?? ""}`}
        >
          {player.grade}
        </td>
      );
    }
    return <td className={numCell}>{player.overallScore.toFixed(2)}</td>;
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
        {player.name}
      </td>
      <td className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400">
        {player.position}
      </td>
      <td className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-mono text-xs">
        {player.team}
      </td>
      <td className={numCell}>{player.gamesPlayed}</td>
      {statCell(player.goals, "goals")}
      {statCell(player.assists, "assists")}
      {plusMinusCell()}
      {statCell(player.powerPlayPoints, "powerPlayPoints")}
      {statCell(player.shortHandedPoints, "shortHandedPoints")}
      {statCell(player.gameWinningGoals, "gameWinningGoals")}
      {statCell(player.shots, "shots")}
      {statCell(player.faceoffWins, "faceoffWins")}
      {statCell(player.hits, "hits")}
      {ovrCell()}
    </tr>
  );
}
