interface LoadingSkeletonProps {
  rows?: number;
  columns?: number;
}

const COLUMN_WIDTHS = [
  "w-36", // Player name
  "w-8",  // Pos
  "w-10", // Team
  "w-8",  // G
  "w-8",  // A
  "w-10", // +/-
  "w-10", // PPP
  "w-10", // SHP
  "w-10", // GWG
  "w-10", // SOG
  "w-10", // FW
  "w-10", // HIT
];

export function LoadingSkeleton({ rows = 25, columns = 12 }: LoadingSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} className="border-b border-gray-100 dark:border-gray-800">
          {Array.from({ length: columns }).map((_, colIdx) => (
            <td
              key={colIdx}
              className={colIdx === 0 ? "px-3 py-2.5" : "px-3 py-2.5 text-right"}
            >
              <div
                className={`h-4 rounded animate-pulse bg-gray-200 dark:bg-gray-700 ${
                  COLUMN_WIDTHS[colIdx] ?? "w-10"
                } ${colIdx === 0 ? "" : "ml-auto"}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
