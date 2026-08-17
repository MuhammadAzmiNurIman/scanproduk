import crypto from "node:crypto";
import type { Stock } from "@/lib/db";

const STOCKS: Stock[] = ["in_stock", "low", "out"];

export type ProductInput = {
  id: string;
  barcode: string | null;
  name: string;
  price: number;
  aisle: number;
  stock: Stock;
  category: string;
};

function makeId(): string {
  return `no-bc-${crypto.randomBytes(5).toString("hex")}`;
}

export function parseProductInput(body: unknown): ProductInput | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  const barcode = String(raw.barcode ?? "").trim();
  const name = String(raw.name ?? "").trim();
  const price = Number(raw.price);
  const aisle = Number(raw.aisle ?? 1);
  const category = String(raw.category ?? "General").trim() || "General";
  const stock: Stock = STOCKS.includes(raw.stock as Stock)
    ? (raw.stock as Stock)
    : "in_stock";

  if (!name || !Number.isFinite(price) || price < 0) return null;
  if (!Number.isInteger(aisle) || aisle < 1) return null;

  return {
    id: barcode ? barcode : makeId(),
    barcode: barcode || null,
    name,
    price,
    aisle,
    stock,
    category,
  };
}
