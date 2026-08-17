"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/store";

type Product = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  aisle: number;
  stock: "in_stock" | "low" | "out";
  category: string;
  image?: string | null;
};

type AuthStatus = "loading" | "logged_out" | "logged_in";

const EMPTY_FORM = {
  barcode: "",
  name: "",
  price: "",
  aisle: "1",
  category: "General",
  stock: "in_stock" as Product["stock"],
  image: "",
};

const STOCK_LABELS: Record<Product["stock"], string> = {
  in_stock: "In Stock",
  low: "Low Stock",
  out: "Out of Stock",
};

export default function AdminPage() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [query, setQuery] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [notice, setNotice] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 480 / img.width);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setForm((f) => ({ ...f, image: canvas.toDataURL("image/jpeg", 0.8) }));
        setFormError("");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/products");
    if (res.ok) {
      const data = (await res.json()) as { products: Product[]; count: number };
      setProducts(data.products);
      setCount(data.count);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/session");
        const data = (await res.json()) as { authenticated: boolean };
        if (cancelled) return;
        if (data.authenticated) {
          setStatus("logged_in");
          await refresh();
        } else {
          setStatus("logged_out");
        }
      } catch {
        if (!cancelled) setStatus("logged_out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loggingIn || !password) return;
      setLoggingIn(true);
      setLoginError("");
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          setStatus("logged_in");
          setPassword("");
          setShowPassword(false);
          await refresh();
        } else {
          setLoginError("Password salah.");
        }
      } catch {
        setLoginError("Terjadi kesalahan. Coba lagi.");
      } finally {
        setLoggingIn(false);
      }
    },
    [password, loggingIn, refresh],
  );

  const handleLogout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setStatus("logged_out");
    setProducts([]);
    setCount(0);
  }, []);

  const openAdd = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((p: Product) => {
    setEditing(p);
    setForm({
      barcode: p.barcode,
      name: p.name,
      price: String(p.price),
      aisle: String(p.aisle),
      category: p.category,
      stock: p.stock,
      image: p.image ?? "",
    });
    setFormError("");
    setFormOpen(true);
  }, []);

  const submitForm = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setFormError("");
      setNotice("");
      const payload = {
        ...form,
        price: Number(form.price),
        aisle: Number(form.aisle),
      };
      const url = editing ? `/api/products/${encodeURIComponent(editing.id)}` : "/api/products";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSaving(false);
      if (res.ok) {
        setFormOpen(false);
        setNotice(editing ? "Produk diperbarui." : "Produk ditambahkan.");
        await refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(data.error ?? "Gagal menyimpan produk.");
      }
    },
    [form, editing, refresh],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    const res = await fetch(`/api/products/${encodeURIComponent(deleting.id)}`, {
      method: "DELETE",
    });
    setDeleting(null);
    if (res.ok) {
      setNotice("Produk dihapus.");
      await refresh();
    }
  }, [deleting, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.barcode.includes(q),
    );
  }, [products, query]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
      </main>
    );
  }

  if (status === "logged_out") {
    return (
      <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-margin-mobile">
        <div className="w-full max-w-sm">
          <Link
            href="/scan"
            className="mb-lg inline-flex items-center gap-xs self-start text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span className="font-body-sm text-body-sm">Kembali ke Scan</span>
          </Link>

          <form
            onSubmit={handleLogin}
            className="flex flex-col rounded-3xl bg-surface-container-lowest p-xl shadow-[0_8px_40px_rgba(0,0,0,0.08)]"
          >
            {/* Header */}
            <div className="mb-lg flex flex-col items-center text-center">
              <div className="mb-md flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
                <span className="material-symbols-outlined text-on-primary text-[28px]">
                  lock
                </span>
              </div>
              <span className="font-headline-lg text-headline-lg text-on-surface">
                Admin Login
              </span>
              <span className="mt-xs font-body-sm text-body-sm text-on-surface-variant">
                Masuk untuk mengelola produk
              </span>
            </div>

            {/* Password field */}
            <span className="mb-xs font-label-caps text-label-caps text-on-surface-variant">
              Password
            </span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLoginError("");
                }}
                placeholder="Masukkan password"
                autoFocus
                autoComplete="current-password"
                disabled={loggingIn}
                className={`w-full rounded-xl border bg-surface py-3 pl-4 pr-12 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none disabled:opacity-60 ${
                  loginError
                    ? "border-error focus:border-error"
                    : "border-outline-variant focus:border-primary"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={loggingIn}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>

            {/* Status slot: error atau hint (tinggi tetap agar tidak loncat) */}
            <div className="mt-sm flex min-h-6 items-center" aria-live="polite">
              {loginError ? (
                <span className="flex items-center gap-xs font-body-sm text-body-sm text-error">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  {loginError}
                </span>
              ) : (
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Password benar: <span className="font-semibold text-primary">admin123</span>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={loggingIn || !password}
              className="mt-md flex w-full items-center justify-center gap-xs rounded-full bg-primary py-3 font-label-caps text-label-caps text-on-primary disabled:opacity-60"
            >
              {loggingIn && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-primary/40 border-t-on-primary" />
              )}
              {loggingIn ? "Memeriksa..." : "Masuk"}
            </button>

            {/* Password demo: isi otomatis */}
            <div className="mt-md flex items-center justify-between rounded-xl bg-primary/10 p-sm">
              <div className="flex items-center gap-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">info</span>
                <span className="font-body-sm text-body-sm text-on-surface">
                  Password demo
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPassword("admin123");
                  setLoginError("");
                }}
                className="rounded-full bg-primary px-4 py-1.5 font-label-caps text-label-caps text-on-primary"
              >
                Isi otomatis
              </button>
            </div>
          </form>

          <p className="mt-lg text-center font-body-sm text-body-sm text-on-surface-variant">
            Lumina Scan · Panel Admin
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-background px-margin-mobile pb-16 pt-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-md flex items-center justify-between">
          <div className="flex items-center gap-md">
            <Link
              href="/scan"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"
              aria-label="Kembali ke Scan"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </Link>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md text-on-surface">
                Admin Produk
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                {count} produk terdaftar
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-xs rounded-full bg-surface-container-high px-4 py-2 font-label-caps text-label-caps text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Keluar
          </button>
        </div>

        {notice && (
          <div className="mb-md flex items-center gap-xs rounded-2xl bg-primary/10 p-md">
            <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
            <span className="font-body-sm text-body-sm text-on-surface">{notice}</span>
          </div>
        )}

        <div className="mb-md flex gap-sm">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama atau barcode..."
              className="w-full rounded-full border border-outline-variant bg-surface py-3 pl-10 pr-4 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="flex shrink-0 items-center gap-xs rounded-full bg-primary px-5 py-3 font-label-caps text-label-caps text-on-primary"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Tambah
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-surface p-xl text-center">
            <span className="material-symbols-outlined text-surface-variant mb-md text-[48px]">
              inventory_2
            </span>
            <span className="font-headline-md text-headline-md text-on-surface mb-sm">
              {products.length === 0 ? "Belum ada produk" : "Tidak ditemukan"}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {products.length === 0
                ? "Tambahkan produk pertama dengan tombol Tambah."
                : "Coba kata kunci lain."}
            </span>
          </div>
        ) : (
          <ul className="flex flex-col gap-sm">
            {filtered.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-md rounded-2xl bg-surface p-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-surface-variant text-[24px]">
                      category
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-headline-md text-headline-md line-clamp-1 text-on-surface">
                    {p.name}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {p.category} · Aisle {p.aisle}
                    {p.barcode ? ` · ${p.barcode}` : " · Tanpa barcode"}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-xs">
                  <span className="font-body-lg text-body-lg font-semibold text-on-surface">
                    {formatPrice(p.price)}
                  </span>
                  <span
                    className={`font-label-caps text-label-caps ${
                      p.stock === "in_stock"
                        ? "text-green-600"
                        : p.stock === "low"
                          ? "text-amber-600"
                          : "text-error"
                    }`}
                  >
                    {STOCK_LABELS[p.stock]}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col gap-xs">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-label={`Edit ${p.name}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(p)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                    aria-label={`Hapus ${p.name}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">delete</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add / Edit modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-on-background/50 p-margin-mobile"
          onClick={() => setFormOpen(false)}
        >
          <form
            onSubmit={submitForm}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full overflow-y-auto rounded-2xl bg-surface-container-lowest p-md shadow-xl"
          >
            <div className="mb-md flex items-center justify-between">
              <span className="font-headline-md text-headline-md text-on-surface">
                {editing ? "Edit Produk" : "Tambah Produk"}
              </span>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
                aria-label="Tutup"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-sm">
              <label className="flex flex-col gap-xs">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Barcode (opsional)</span>
                <input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/[^\d]/g, "") })}
                  placeholder="Kosongkan jika tidak ada barcode"
                  disabled={!!editing}
                  inputMode="numeric"
                  className={`w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none ${
                    editing ? "bg-surface-container-low text-on-surface-variant" : ""
                  }`}
                />
              </label>

              <label className="flex flex-col gap-xs">
                <span className="font-label-caps text-label-caps text-on-surface-variant">Nama Produk</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Contoh: Aurora Organics Coffee"
                  className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                />
              </label>

              <div className="flex flex-col gap-xs">
                <span className="font-label-caps text-label-caps text-on-surface-variant">
                  Foto Produk (opsional)
                </span>
                <div className="flex items-center gap-sm">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container">
                    {form.image ? (
                      <img
                        src={form.image}
                        alt="Pratinjau produk"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-surface-variant text-[28px]">
                        photo_camera
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-xs rounded-full border border-outline px-4 py-2 font-label-caps text-label-caps text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                    Pilih Foto
                  </button>
                  {form.image && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, image: "" }))}
                      className="flex items-center gap-xs rounded-full border border-outline px-4 py-2 font-label-caps text-label-caps text-on-surface-variant"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Hapus
                    </button>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    className="hidden"
                  />
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Foto ini dipakai untuk pencocokan visual saat scan kamera.
                </span>
              </div>

              <div className="flex gap-sm">
                <label className="flex flex-1 flex-col gap-xs">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Harga (IDR)</span>
                  <input
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value.replace(/\D/g, "") })}
                    placeholder="240000"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex w-24 flex-col gap-xs">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Aisle</span>
                  <input
                    value={form.aisle}
                    onChange={(e) => setForm({ ...form, aisle: e.target.value.replace(/[^\d]/g, "") })}
                    placeholder="1"
                    inputMode="numeric"
                    className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                  />
                </label>
              </div>

              <div className="flex gap-sm">
                <label className="flex flex-1 flex-col gap-xs">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Kategori</span>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="Beverages"
                    className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-xs">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">Stok</span>
                  <select
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value as Product["stock"] })}
                    className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-3 font-body-lg text-body-lg text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                  </select>
                </label>
              </div>
            </div>

            {formError && (
              <span className="mt-sm block font-body-sm text-body-sm text-error">{formError}</span>
            )}

            <div className="mt-md flex gap-sm">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="flex-1 rounded-full border border-outline py-3 font-label-caps text-label-caps text-on-surface"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-full bg-primary py-3 font-label-caps text-label-caps text-on-primary disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleting && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-on-background/50 p-margin-mobile"
          onClick={() => setDeleting(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-md shadow-xl"
          >
            <span className="material-symbols-outlined text-error mb-sm block text-[40px]">
              delete
            </span>
            <span className="font-headline-md text-headline-md text-on-surface block">
              Hapus produk ini?
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant mt-xs block">
              <span className="font-semibold">{deleting.name}</span> akan dihapus
              permanen dari database.
            </span>
            <div className="mt-md flex gap-sm">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="flex-1 rounded-full border border-outline py-3 font-label-caps text-label-caps text-on-surface"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 rounded-full bg-error py-3 font-label-caps text-label-caps text-on-error"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}