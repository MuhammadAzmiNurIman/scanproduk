"use client";

import Link from "next/link";
import { useStore, formatPrice } from "@/lib/store";

export default function ShoppingListPage() {
  const { list, removeFromList } = useStore();
  const total = list.reduce((sum, item) => sum + item.price, 0);

  return (
    <main className="min-h-screen w-full bg-background px-margin-mobile pb-28 pt-24">
      <div className="mx-auto w-full max-w-xl">
        <h2 className="font-headline-lg text-headline-lg text-on-surface mb-md">
          Shopping list
        </h2>

        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface p-xl text-center">
            <span className="material-symbols-outlined text-surface-variant mb-md text-[48px]">
              format_list_bulleted
            </span>
            <span className="font-headline-md text-headline-md text-on-surface mb-sm">
              List is empty
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant mb-md">
              Add items by scanning or searching products.
            </span>
            <Link
              href="/scan"
              className="rounded-full bg-primary px-6 py-2 font-label-caps text-label-caps text-on-primary"
            >
              Scan now
            </Link>
          </div>
        ) : (
          <>
            <ul className="mb-md flex flex-col gap-sm">
              {list.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-md rounded-2xl bg-surface p-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                    <span className="material-symbols-outlined text-surface-variant text-[24px]">
                      category
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-headline-md text-headline-md line-clamp-1 text-on-surface">
                      {item.name}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Aisle {item.aisle}
                    </span>
                  </div>
                  <span className="font-body-lg text-body-lg font-semibold text-on-surface">
                    {formatPrice(item.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFromList(item.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                    aria-label={`Remove ${item.name}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between rounded-2xl bg-primary/10 p-md">
              <span className="font-label-caps text-label-caps text-primary">
                {list.length} item{list.length > 1 ? "s" : ""}
              </span>
              <span className="font-display-price text-display-price text-on-surface">
                {formatPrice(total)}
              </span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
