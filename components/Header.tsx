"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TITLES: Record<string, { title: string; subtitle: string }> = {
  "/scan": { title: "Scan", subtitle: "Target - Downtown" },
  "/history": { title: "History", subtitle: "Recent scans" },
  "/shopping-list": { title: "List", subtitle: "Shopping list" },
};

export default function Header() {
  const pathname = usePathname();
  const config =
    TITLES[pathname] ??
    (pathname.startsWith("/scan")
      ? TITLES["/scan"]
      : pathname.startsWith("/history")
        ? TITLES["/history"]
        : TITLES["/shopping-list"]);

  return (
    <header className="fixed top-0 z-50 w-full bg-surface/80 pt-safe shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-md px-margin-mobile">
        <div className="flex items-center gap-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-md">
            <span className="material-symbols-outlined text-on-primary text-[18px]">
              qr_code_scanner
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md text-on-surface">
              {config.title}
            </span>
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-primary text-[14px]">
                location_on
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {config.subtitle}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <Link
            href="/admin"
            title="Admin"
            aria-label="Admin"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-on-primary text-[18px]">
              person
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
