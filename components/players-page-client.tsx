"use client";

import { CustomTeamTable } from "@/components/custom-team-table";
import { PlayersTable } from "@/components/players-table";
import type { GradeThreshold, PlayerRow } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

const STORAGE_KEY = "hockey-custom-team";

export function PlayersPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [customPlayers, setCustomPlayers] = useState<PlayerRow[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, GradeThreshold>>({});
  const [perGameThresholds, setPerGameThresholds] = useState<Record<string, GradeThreshold>>({});
  const [showGrade, setShowGrade] = useState(false);
  const [showPerGame, setShowPerGame] = useState(false);

  const includeFW = searchParams.get("includeFW") !== "0";

  function toggleFW(checked: boolean) {
    const next = new URLSearchParams(searchParams.toString());
    if (checked) next.delete("includeFW");
    else next.set("includeFW", "0");
    startTransition(() => router.push(`/players?${next.toString()}`));
  }

  // Hydrate from storage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCustomPlayers(JSON.parse(raw) as PlayerRow[]);
    } catch {}
  }, []);

  function updatePlayers(updater: (prev: PlayerRow[]) => PlayerRow[]) {
    setCustomPlayers((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const customIds = new Set(customPlayers.map((p) => p.playerId));

  function handleAdd(player: PlayerRow) {
    updatePlayers((prev) =>
      prev.find((p) => p.playerId === player.playerId)
        ? prev
        : [...prev, player],
    );
  }

  function handleRemove(playerId: number) {
    updatePlayers((prev) => prev.filter((p) => p.playerId !== playerId));
  }

  function handleClearTeam() {
    updatePlayers(() => []);
  }

  const handleRowsReady = useCallback((rows: PlayerRow[]) => {
    const scoreMap = new Map(rows.map((r) => [r.playerId, { overallScore: r.overallScore, grade: r.grade }]));
    setCustomPlayers((prev) =>
      prev.map((p) => {
        const fresh = scoreMap.get(p.playerId);
        return fresh ? { ...p, ...fresh } : p;
      }),
    );
  }, []);

  return (
    <div className="space-y-8">
      {/* Global controls */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeFW}
            onChange={(e) => toggleFW(e.target.checked)}
            className="cursor-pointer"
          />
          FW (used in OVR)
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showGrade}
            onChange={(e) => setShowGrade(e.target.checked)}
            className="cursor-pointer"
          />
          Grades
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPerGame}
            onChange={(e) => setShowPerGame(e.target.checked)}
            className="cursor-pointer"
          />
          Per Game
        </label>
      </div>

      {customPlayers.length > 0 && (
        <CustomTeamTable
          players={customPlayers}
          thresholds={showPerGame ? perGameThresholds : thresholds}
          onRemove={handleRemove}
          onClear={handleClearTeam}
          showGrade={showGrade}
          showPerGame={showPerGame}
        />
      )}

      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
            NHL Player Stats
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Fantasy-relevant skater statistics — current season
          </p>
        </div>
        <PlayersTable
          onAddPlayer={handleAdd}
          onThresholdsReady={setThresholds}
          onPerGameThresholdsReady={setPerGameThresholds}
          onRowsReady={handleRowsReady}
          customPlayerIds={customIds}
          showGrade={showGrade}
          showPerGame={showPerGame}
        />
      </div>
    </div>
  );
}
