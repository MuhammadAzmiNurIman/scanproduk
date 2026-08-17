import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import {
  countProducts,
  createProduct,
  listProducts,
  rowToProduct,
} from "@/lib/db";
import { processImage } from "@/lib/image";
import { parseProductInput } from "@/lib/validation";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({
      products: (await listProducts()).map(rowToProduct),
      count: await countProducts(),
    });
  } catch (err) {
    console.error("[products] GET error:", err);
    return NextResponse.json(
      { error: `Gagal memuat produk: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const input = parseProductInput(body);

  if (!input) {
    return NextResponse.json(
      { error: "Data tidak valid. Pastikan nama dan harga terisi." },
      { status: 400 },
    );
  }

  try {
    const imageInfo =
      typeof body?.image === "string" && body.image
        ? await processImage(body.image)
        : null;

    const existing = await createProduct({
      ...input,
      image: imageInfo?.image ?? null,
      signature: imageInfo?.signature ?? null,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Produk dengan barcode tersebut sudah terdaftar." },
        { status: 409 },
      );
    }

    return NextResponse.json(rowToProduct(existing), { status: 201 });
  } catch (err) {
    console.error("[products] POST error:", err);
    return NextResponse.json(
      { error: `Gagal menyimpan produk: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}