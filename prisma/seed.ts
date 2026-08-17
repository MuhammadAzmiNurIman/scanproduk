import { prisma } from "../lib/prisma";
import { PRODUCTS } from "../lib/products";

async function main() {
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
  const count = await prisma.product.count();
  console.log(`Seed selesai: ${count} produk terdaftar.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });