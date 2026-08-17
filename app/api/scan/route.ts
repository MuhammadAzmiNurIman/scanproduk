import { NextRequest, NextResponse } from "next/server";
import {
  findProduct,
  listProducts,
  rowToProduct,
  searchProducts,
} from "@/lib/db";
import { compareSignatures, processImage } from "@/lib/image";

const MATCH_THRESHOLD = 0.55;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const barcode = body?.barcode;
  const query = body?.query;
  const image = body?.image;

  if (typeof image === "string" && image.startsWith("data:image")) {
    const info = await processImage(image);
    if (!info) {
      return NextResponse.json(
        { error: "Gambar tidak dapat diproses." },
        { status: 400 },
      );
    }

    const rows = await listProducts();
    const scored = rows
      .map((row) => ({
        row,
        score: row.signature
          ? compareSignatures(info.signature, row.signature)
          : 0,
      }))
      .filter((x) => x.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return NextResponse.json({
      results: scored.map((x) => ({
        ...rowToProduct(x.row),
        matchScore: Math.round(x.score * 100),
      })),
      hasImageProducts: rows.some((r) => r.image),
    });
  }

  if (typeof barcode === "string" && barcode.trim()) {
    const row = await findProduct(barcode.trim());
    if (!row) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ product: rowToProduct(row) });
  }

  if (typeof query === "string" && query.trim()) {
    const results = (await searchProducts(query.trim())).map(rowToProduct);
    return NextResponse.json({ results });
  }

  return NextResponse.json(
    { error: "Masukkan barcode, nama produk, atau gambar." },
    { status: 400 },
  );
}