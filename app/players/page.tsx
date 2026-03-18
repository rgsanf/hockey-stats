import { Suspense } from "react";
import { PlayersTable } from "@/components/players-table";
import { LoadingSkeleton } from "@/components/loading-skeleton";
import { COLUMN_DEFS } from "@/lib/mappers";

// In Next.js 15+, searchParams on page.tsx is a Promise — we don't actually
// need the initial values here since PlayersTable reads them client-side via
// useSearchParams(). The page is intentionally thin.
export default function PlayersPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
            NHL Player Stats
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Fantasy-relevant skater statistics — current season
          </p>
        </div>

        {/* PlayersTable uses useSearchParams() so it must live inside a Suspense boundary */}
        <Suspense fallback={<TableShell />}>
          <PlayersTable />
        </Suspense>
      </div>
    </main>
  );
}

/** Fallback shown while PlayersTable is hydrating */
function TableShell() {
  return (
    <div className="space-y-3">
      {/* Filters placeholder */}
      <div className="flex gap-3">
        {[44, 32, 32, 32, 28].map((w, i) => (
          <div
            key={i}
            className={`h-8 w-${w} rounded animate-pulse bg-gray-200 dark:bg-gray-800`}
          />
        ))}
      </div>

      {/* Table placeholder */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                {COLUMN_DEFS.map((col) => (
                  <th
                    key={col.key as string}
                    className={`px-3 py-2.5 text-xs uppercase tracking-wide font-semibold text-gray-400 ${
                      col.align === "left"
                        ? "text-left"
                        : col.align === "right"
                        ? "text-right"
                        : "text-center"
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LoadingSkeleton rows={25} columns={COLUMN_DEFS.length} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
