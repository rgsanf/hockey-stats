"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildSeasonOptions, getCurrentSeason, POSITIONS } from "@/lib/mappers";

interface TableFiltersProps {
  availableTeams: string[];
}

const SEASON_OPTIONS = buildSeasonOptions(2026); // reference year: 2026

const selectBase =
  "text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

export function TableFilters({ availableTeams }: TableFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSeason = searchParams.get("season") || getCurrentSeason();
  const currentPosition = searchParams.get("position") || "";
  const currentTeam = searchParams.get("team") || "";

  // Local state for search input — debounced before pushing to URL
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");

  // Sync local search state when URL changes externally (e.g. back/forward navigation)
  useEffect(() => {
    setSearchInput(searchParams.get("search") || "");
  }, [searchParams]);

  // Debounce search input: push to URL 300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = searchInput.trim();
      if (trimmed) {
        next.set("search", trimmed);
      } else {
        next.delete("search");
      }
      router.push(`/players?${next.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.push(`/players?${next.toString()}`);
  }

  function handleReset() {
    const defaultSeason = getCurrentSeason();
    setSearchInput("");
    router.push(`/players?season=${defaultSeason}&sortBy=goals&sortDir=DESC`);
  }

  const hasActiveFilters =
    searchInput.trim() ||
    currentPosition ||
    currentTeam ||
    currentSeason !== getCurrentSeason();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <input
        type="search"
        placeholder="Search players…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className={`${selectBase} w-44 pl-3`}
        aria-label="Search players by name"
      />

      {/* Season */}
      <select
        value={currentSeason}
        onChange={(e) => updateParam("season", e.target.value)}
        className={selectBase}
        aria-label="Select season"
      >
        {SEASON_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Position */}
      <select
        value={currentPosition}
        onChange={(e) => updateParam("position", e.target.value)}
        className={selectBase}
        aria-label="Filter by position"
      >
        <option value="">All Positions</option>
        {POSITIONS.map((pos) => (
          <option key={pos} value={pos}>
            {pos}
          </option>
        ))}
      </select>

      {/* Team */}
      <select
        value={currentTeam}
        onChange={(e) => updateParam("team", e.target.value)}
        className={selectBase}
        aria-label="Filter by team"
        disabled={availableTeams.length === 0}
      >
        <option value="">All Teams</option>
        {availableTeams.map((team) => (
          <option key={team} value={team}>
            {team}
          </option>
        ))}
      </select>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={handleReset}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline cursor-pointer"
        >
          Reset
        </button>
      )}
    </div>
  );
}
