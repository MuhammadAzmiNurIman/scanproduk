import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import {
  deleteProduct,
  rowToProduct,
  updateProduct,
} from "@/lib/db";
import { processImage } from "@/lib/image";
import { parseProductInput } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const input = parseProductInput(body);

  if (!input) {
    return NextResponse.json(
      { error: "Data tidak valid. Pastikan nama dan harga terisi." },
      { status: 400 },
    );
  }

  try {
    let imageUpdate: { image: string | null; signature: string | null } | null =
      null;
    if (body && typeof body === "object" && "image" in body) {
      if (typeof body.image === "string" && body.image) {
        const info = await processImage(body.image);
        imageUpdate = info
          ? { image: info.image, signature: info.signature }
          : { image: null, signature: null };
      } else {
        imageUpdate = { image: null, signature: null };
      }
    }

    const updated = await updateProduct(id, input, imageUpdate);

    if (!updated) {
      return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json(rowToProduct(updated));
  } catch (err) {
    console.error("[products] PUT error:", err);
    return NextResponse.json(
      { error: `Gagal memperbarui produk: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deleted = await deleteProduct(id);

    if (!deleted) {
      return NextResponse.json({ error: "Produk tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[products] DELETE error:", err);
    return NextResponse.json(
      { error: `Gagal menghapus produk: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}