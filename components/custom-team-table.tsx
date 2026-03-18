"use client";

import { useMemo, useState } from "react";
import { COLUMN_DEFS } from "@/lib/mappers";
import { PlayerRowItem, SortIcon } from "@/components/players-table";
import type { GradeThreshold, PlayerRow } from "@/lib/types";

export function CustomTeamTable({
  players,
  thresholds,
  onRemove,
  showGrade,
  showPerGame,
}: {
  players: PlayerRow[];
  thresholds: Record<string, GradeThreshold>;
  onRemove: (playerId: number) => void;
  showGrade: boolean;
  showPerGame: boolean;
}) {
  const [sortBy, setSortBy] = useState("goals");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("DESC");

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => (d === "DESC" ? "ASC" : "DESC"));
    } else {
      setSortBy(key);
      setSortDir("DESC");
    }
  }

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortBy];
      const bv = (b as Record<string, unknown>)[sortBy];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "DESC" ? bv - av : av - bv;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "DESC" ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return 0;
    });
  }, [players, sortBy, sortDir]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
          Custom Team
        </h2>
        <span className="text-sm text-gray-400 dark:text-gray-500">
          {players.length} player{players.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="w-8" />
                {COLUMN_DEFS.map((col) => {
                  const isActive = sortBy === col.key;
                  const canSort = col.sortable;
                  return (
                    <th
                      key={col.key as string}
                      className={[
                        "px-3 py-2.5 font-semibold text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 select-none whitespace-nowrap",
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
                        canSort ? () => handleSort(col.key as string) : undefined
                      }
                    >
                      {col.header}
                      {canSort && <SortIcon active={isActive} dir={sortDir} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((player) => (
                <PlayerRowItem
                  key={player.playerId}
                  player={player}
                  showGrade={showGrade}
                  showPerGame={showPerGame}
                  thresholds={thresholds}
                  action={
                    <button
                      onClick={() => onRemove(player.playerId)}
                      className="flex items-center justify-center w-full text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-bold text-base leading-none cursor-pointer"
                      aria-label={`Remove ${player.name}`}
                    >
                      ×
                    </button>
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
