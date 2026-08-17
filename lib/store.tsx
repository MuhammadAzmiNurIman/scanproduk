"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/lib/products";

export type HistoryEntry = Product & { scannedAt: number };
export type ListItem = Product & { addedAt: number };

type Store = {
  history: HistoryEntry[];
  list: ListItem[];
  addToHistory: (product: Product) => void;
  addToList: (product: Product) => void;
  removeFromList: (id: string) => void;
  clearHistory: () => void;
};

const StoreContext = createContext<Store | null>(null);

const HISTORY_KEY = "lumina.history";
const LIST_KEY = "lumina.list";

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [list, setList] = useState<ListItem[]>([]);

  useEffect(() => {
    // Load persisted state once on mount (hydration-safe: SSR renders empty).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(load<HistoryEntry>(HISTORY_KEY));
    setList(load<ListItem>(LIST_KEY));
  }, []);

  useEffect(() => {
    if (history.length) window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (list.length) window.localStorage.setItem(LIST_KEY, JSON.stringify(list));
  }, [list]);

  const addToHistory = useCallback((product: Product) => {
    setHistory((prev) => [
      { ...product, scannedAt: Date.now() },
      ...prev.filter((entry) => entry.id !== product.id),
    ].slice(0, 50));
  }, []);

  const addToList = useCallback((product: Product) => {
    setList((prev) =>
      prev.some((item) => item.id === product.id)
        ? prev
        : [{ ...product, addedAt: Date.now() }, ...prev],
    );
  }, []);

  const removeFromList = useCallback((id: string) => {
    setList((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return (
    <StoreContext.Provider
      value={{ history, list, addToHistory, addToList, removeFromList, clearHistory }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
