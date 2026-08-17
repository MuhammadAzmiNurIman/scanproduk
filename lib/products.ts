export type Product = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  aisle: number;
  stock: "in_stock" | "low" | "out";
  category: string;
  image?: string | null;
};

export const PRODUCTS: Record<string, Product> = {
  "036000291452": {
    id: "036000291452",
    barcode: "036000291452",
    name: "Aurora Organics Coffee, Whole Bean",
    price: 240000,
    aisle: 4,
    stock: "in_stock",
    category: "Beverages",
  },
  "012345678905": {
    id: "012345678905",
    barcode: "012345678905",
    name: "Harvest Gold Granola, Maple Pecan",
    price: 104000,
    aisle: 2,
    stock: "in_stock",
    category: "Breakfast",
  },
  "076806423790": {
    id: "076806423790",
    barcode: "076806423790",
    name: "ClearSpring Sparkling Water, Citrus",
    price: 64000,
    aisle: 9,
    stock: "in_stock",
    category: "Beverages",
  },
  "4902430044213": {
    id: "4902430044213",
    barcode: "4902430044213",
    name: "Sakura Matcha Powder, Ceremonial",
    price: 344000,
    aisle: 5,
    stock: "low",
    category: "Beverages",
  },
  "0049000042577": {
    id: "0049000042577",
    barcode: "0049000042577",
    name: "GoldenSun Organic Honey",
    price: 140000,
    aisle: 6,
    stock: "in_stock",
    category: "Pantry",
  },
  "3033710010011": {
    id: "3033710010011",
    barcode: "3033710010011",
    name: "BlueRidge Trail Mix",
    price: 96000,
    aisle: 2,
    stock: "in_stock",
    category: "Snacks",
  },
  "0850001690012": {
    id: "0850001690012",
    barcode: "0850001690012",
    name: "Verdant Soap Bar, Lavender",
    price: 68000,
    aisle: 11,
    stock: "low",
    category: "Personal Care",
  },
  "no-bc-avocado": {
    id: "no-bc-avocado",
    barcode: "",
    name: "Fresh Hass Avocado",
    price: 24000,
    aisle: 1,
    stock: "in_stock",
    category: "Produce",
  },
  "no-bc-banana": {
    id: "no-bc-banana",
    barcode: "",
    name: "Organic Bananas",
    price: 32000,
    aisle: 1,
    stock: "in_stock",
    category: "Produce",
  },
  "no-bc-sourdough": {
    id: "no-bc-sourdough",
    barcode: "",
    name: "Artisan Sourdough Loaf",
    price: 72000,
    aisle: 3,
    stock: "low",
    category: "Bakery",
  },
};
