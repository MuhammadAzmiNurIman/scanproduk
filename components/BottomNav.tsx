"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { path: "/scan", icon: "barcode_scanner", label: "Scan" },
  { path: "/history", icon: "receipt_long", label: "History" },
  { path: "/shopping-list", icon: "format_list_bulleted", label: "List" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 z-50 w-full bg-surface/80 pb-safe shadow-[0_-1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-around">
        {ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex h-full w-full flex-col items-center justify-center transition-all ${
                active ? "font-bold text-primary" : "text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-label-caps text-label-caps">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
