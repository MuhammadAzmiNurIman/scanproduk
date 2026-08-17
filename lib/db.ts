import {
  Prisma,
  type Product as PrismaProduct,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PRODUCTS, type Product } from "@/lib/products";

export type Stock = "in_stock" | "low" | "out";

export type ProductRow = {
  id: string;
  barcode: string | null;
  name: string;
  price: number;
  aisle: number;
  stock: Stock;
  category: string;
  image: string | null;
  signature: string | null;
  created_at: number;
};

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    barcode: row.barcode ?? "",
    name: row.name,
    price: row.price,
    aisle: row.aisle,
    stock: row.stock,
    category: row.category,
    image: row.image ?? null,
  };
}

function toRow(row: PrismaProduct): ProductRow {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    price: row.price,
    aisle: row.aisle,
    stock: (["in_stock", "low", "out"].includes(row.stock)
      ? row.stock
      : "in_stock") as Stock,
    category: row.category,
    image: row.image,
    signature: row.signature,
    created_at: Number(row.createdAt),
  };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(row: ProductRow, tokens: string[]): number {
  const name = normalize(row.name);
  const barcode = row.barcode ?? "";
  if (!tokens.length) return 0;

  if (barcode && barcode.includes(tokens[0])) {
    return 900 + (barcode === tokens[0] ? 100 : 0);
  }

  if (name === tokens.join(" ")) return 1000;
  if (tokens.length === 1) {
    if (name === tokens[0]) return 1000;
    if (name.startsWith(tokens[0])) return 600;
    if (name.includes(tokens[0])) return 300;
    return 0;
  }

  const words = name.split(" ");
  let score = 0;
  for (const token of tokens) {
    if (words.some((w) => w.startsWith(token))) score += 300;
    else if (name.includes(token)) score += 100;
    else return 0;
  }
  if (name.startsWith(tokens[0])) score += 50;
  return score;
}

export async function findProductById(id: string): Promise<ProductRow | null> {
  const row = await prisma.product.findUnique({ where: { id } });
  return row ? toRow(row) : null;
}

export async function findProduct(barcode: string): Promise<ProductRow | null> {
  if (!barcode) return null;
  const row = await prisma.product.findUnique({ where: { barcode } });
  return row ? toRow(row) : null;
}

export async function listProducts(): Promise<ProductRow[]> {
  const rows = await prisma.product.findMany();
  return rows
    .map(toRow)
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
}

export async function countProducts(): Promise<number> {
  return prisma.product.count();
}

export async function searchProducts(
  query: string,
  limit = 8,
): Promise<ProductRow[]> {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const rows = await prisma.product.findMany();
  return rows
    .map(toRow)
    .map((row) => ({ row, score: scoreMatch(row, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.row);
}

export async function createProduct(
  input: Omit<ProductRow, "created_at">,
): Promise<ProductRow | null> {
  try {
    const row = await prisma.product.create({
      data: {
        id: input.id,
        barcode: input.barcode,
        name: input.name,
        price: input.price,
        aisle: input.aisle,
        stock: input.stock,
        category: input.category,
        image: input.image,
        signature: input.signature,
        createdAt: BigInt(Date.now()),
      },
    });
    return toRow(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

export async function updateProduct(
  id: string,
  input: Partial<Omit<ProductRow, "id" | "barcode" | "created_at">>,
  imageUpdate: { image: string | null; signature: string | null } | null = null,
): Promise<ProductRow | null> {
  const existing = await findProductById(id);
  if (!existing) return null;
  try {
    const row = await prisma.product.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        price: input.price ?? existing.price,
        aisle: input.aisle ?? existing.aisle,
        stock: input.stock ?? existing.stock,
        category: input.category ?? existing.category,
        image: imageUpdate ? imageUpdate.image : existing.image,
        signature: imageUpdate ? imageUpdate.signature : existing.signature,
        createdAt: BigInt(existing.created_at),
      },
    });
    return toRow(row);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return null;
    }
    throw err;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return false;
    }
    throw err;
  }
}

export async function seedDatabase(): Promise<void> {
  for (const p of Object.values(PRODUCTS)) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        price: p.price,
        aisle: p.aisle,
        stock: p.stock,
        category: p.category,
        barcode: p.barcode || null,
        createdAt: BigInt(Date.now()),
      },
      create: {
        id: p.id,
        barcode: p.barcode || null,
        name: p.name,
        price: p.price,
        aisle: p.aisle,
        stock: p.stock,
        category: p.category,
        image: null,
        signature: null,
        createdAt: BigInt(Date.now()),
      },
    });
  }
}
