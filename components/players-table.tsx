"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlayerRow, PlayersApiResponse } from "@/lib/types";
import { COLUMN_DEFS, getCurrentSeason } from "@/lib/mappers";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { TableFilters } from "@/components/table-filters";

// Sort indicator icons
function SortIcon({ active, dir }: { active: boolean; dir: "ASC" | "DESC" }) {
  if (!active) return <span className="ml-1 text-gray-400 text-xs">⇅</span>;
  return (
    <span className="ml-1 text-blue-500 text-xs">{dir === "ASC" ? "▲" : "▼"}</span>
  );
}

export function PlayersTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [data, setData] = useState<PlayersApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive available teams from the current data for the team filter dropdown.
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);

  // Read current state from URL, with defaults
  const season = searchParams.get("season") || getCurrentSeason();
  const sortBy = searchParams.get("sortBy") || "goals";
  const sortDir = (searchParams.get("sortDir") || "DESC") as "ASC" | "DESC";

  // Fetch data whenever search params change
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
            (body as { error?: string }).error || `Request failed (${res.status})`
          );
        }
        const json = (await res.json()) as PlayersApiResponse;
        setData(json);
        // Collect unique single-team abbreviations for the team filter dropdown
        const teams = Array.from(
          new Set(
            json.rows
              .map((r) => r.team)
              .filter((t) => t && !t.includes("Teams"))
          )
        ).sort();
        setAvailableTeams(teams);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to load player data.");
      } finally {
        setLoading(false);
      }
    },
    [paramsString]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  function pushParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    startTransition(() => {
      router.push(`/players?${next.toString()}`);
    });
  }

  function handleSort(columnKey: string) {
    const newDir =
      sortBy === columnKey && sortDir === "DESC" ? "ASC" : "DESC";
    pushParams({ sortBy: columnKey, sortDir: newDir });
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  const showSkeleton = loading && !data;
  const showOverlay = isPending || (loading && !!data);

  return (
    <div className="space-y-3">
      {/* Filters row */}
      <TableFilters availableTeams={availableTeams} />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            onClick={() => {
              const controller = new AbortController();
              fetchData(controller.signal);
            }}
            className="shrink-0 font-medium underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="relative rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Pending overlay — keeps old data visible at reduced opacity */}
        {showOverlay && !showSkeleton && (
          <div className="absolute inset-0 bg-white/50 dark:bg-gray-950/50 z-20 pointer-events-none" />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {COLUMN_DEFS.map((col) => {
                  const isActive = sortBy === col.key;
                  const canSort = col.sortable;
                  return (
                    <th
                      key={col.key as string}
                      className={[
                        "px-3 py-2.5 font-semibold text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 select-none whitespace-nowrap",
                        col.align === "left" ? "text-left" : col.align === "right" ? "text-right" : "text-center",
                        col.minWidth ? `min-w-[${col.minWidth}]` : "",
                        canSort
                          ? "cursor-pointer hover:text-gray-800 dark:hover:text-gray-100"
                          : "",
                        isActive ? "text-blue-600 dark:text-blue-400" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={canSort ? () => handleSort(col.key as string) : undefined}
                      aria-sort={
                        isActive
                          ? sortDir === "ASC"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {col.header}
                      {canSort && (
                        <SortIcon active={isActive} dir={sortDir} />
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
                  <PlayerRowItem key={player.playerId} player={player} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row count */}
      {data && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
          {data.rows.length} players
        </p>
      )}
    </div>
  );
}

function PlayerRowItem({ player }: { player: PlayerRow }) {
  const numCell = "px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300";
  const signed = player.plusMinus > 0 ? "+" : "";

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
      <td className={numCell}>{player.goals}</td>
      <td className={numCell}>{player.assists}</td>
      <td
        className={`${numCell} ${
          player.plusMinus > 0
            ? "text-green-600 dark:text-green-400"
            : player.plusMinus < 0
            ? "text-red-500 dark:text-red-400"
            : ""
        }`}
      >
        {signed}{player.plusMinus}
      </td>
      <td className={numCell}>{player.powerPlayPoints}</td>
      <td className={numCell}>{player.shortHandedPoints}</td>
      <td className={numCell}>{player.gameWinningGoals}</td>
      <td className={numCell}>{player.shots}</td>
      <td className={numCell}>{player.faceoffWins}</td>
      <td className={numCell}>{player.hits}</td>
      <td className={numCell}>{player.overallScore.toFixed(2)}</td>
    </tr>
  );
}
