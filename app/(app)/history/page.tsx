"use client";

import { useStore, formatPrice, formatTimestamp } from "@/lib/store";

export default function HistoryPage() {
  const { history, clearHistory } = useStore();

  return (
    <main className="min-h-screen w-full bg-background px-margin-mobile pb-28 pt-24">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-md flex items-center justify-between">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">
            Recent scans
          </h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="font-label-caps text-label-caps text-error"
            >
              Clear
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface p-xl text-center">
            <span className="material-symbols-outlined text-surface-variant mb-md text-[48px]">
              history
            </span>
            <span className="font-headline-md text-headline-md text-on-surface mb-sm">
              No scans yet
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Scan a barcode or search a product to see it here.
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-sm">
            {history.map((entry) => (
              <li
                key={`${entry.id}-${entry.scannedAt}`}
                className="flex items-center gap-md rounded-2xl bg-surface p-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                  <span className="material-symbols-outlined text-surface-variant text-[24px]">
                    category
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-headline-md text-headline-md line-clamp-1 text-on-surface">
                    {entry.name}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {formatTimestamp(entry.scannedAt)} · Aisle {entry.aisle}
                  </span>
                </div>
                <span className="font-body-lg text-body-lg font-semibold text-on-surface">
                  {formatPrice(entry.price)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
