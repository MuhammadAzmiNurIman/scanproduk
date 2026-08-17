"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWorker, PSM, type Worker } from "tesseract.js";
import type { Product } from "@/lib/products";
import { useStore, formatPrice } from "@/lib/store";

type ScanState = "idle" | "fetching" | "success" | "error";

type ScanResult = Product & { matchScore?: number };

const CORNERS = [
  "tl-h",
  "tl-v",
  "tr-h",
  "tr-v",
  "bl-h",
  "bl-v",
  "br-h",
  "br-v",
] as const;

let ocrWorkerPromise: Promise<Worker> | null = null;

function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker("eng", undefined, { logger: () => {} }).then(
      async (worker) => {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        return worker;
      },
    );
  }
  return ocrWorkerPromise;
}

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const laserRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<ScanState>("idle");
  const [product, setProduct] = useState<Product | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [ocrText, setOcrText] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"search" | "photo">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ScanResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [noPhotoProducts, setNoPhotoProducts] = useState(false);

  const galleryInputRef = useRef<HTMLInputElement>(null);

  const { addToHistory, addToList } = useStore();

  const stateRef = useRef<ScanState>("idle");

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Camera setup
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
      } catch (err) {
        console.error("Camera error:", err);
      }
    }

    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Flashlight toggle
  useEffect(() => {
    const track = videoRef.current?.srcObject instanceof MediaStream
      ? videoRef.current.srcObject.getVideoTracks()[0]
      : null;
    if (!track) return;
    track
      .applyConstraints({
        // @ts-expect-error torch is not in the standard types
        advanced: [{ torch: flashOn }],
      })
      .catch(() => {});
  }, [flashOn]);

  const presentProduct = useCallback(
    (p: Product) => {
      setProduct(p);
      addToHistory(p);
      setState("success");
    },
    [addToHistory],
  );

  const lookupProduct = useCallback(
    async (barcode: string) => {
      if (stateRef.current !== "idle") return;
      setState("fetching");
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcode }),
        });
        if (res.ok) {
          const data = (await res.json()) as { product: Product };
          presentProduct(data.product);
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
    },
    [presentProduct],
  );

  // Real barcode detection (progressive enhancement)
  useEffect(() => {
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) return;
    const detector = new (window as unknown as {
      BarcodeDetector: new () => {
        detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
      };
    }).BarcodeDetector();

    let running = true;
    let lastDetected = "";

    const tick = async () => {
      if (!running) return;
      if (stateRef.current === "idle" && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const codes = await detector.detect(videoRef.current);
          const code = codes[0]?.rawValue;
          if (code && code !== lastDetected) {
            lastDetected = code;
            await lookupProduct(code);
          }
        } catch {
          /* ignore */
        }
      }
      setTimeout(tick, 350);
    };

    tick();
    return () => {
      running = false;
    };
  }, [lookupProduct]);

  // OCR: baca teks pada label produk via kamera
  const runOcr = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setState("fetching");
    try {
      const scale = Math.min(1, 800 / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const worker = await getOcrWorker();
      const { data } = await worker.recognize(canvas);
      const text = (data.text ?? "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) {
        setOcrText("");
        setState("error");
        return;
      }

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });

      if (res.ok) {
        const data2 = (await res.json()) as { results: Product[] };
        if (data2.results.length > 0) {
          presentProduct(data2.results[0]);
        } else {
          setOcrText(text);
          setState("error");
        }
      } else {
        setOcrText("");
        setState("error");
      }
    } catch {
      setOcrText("");
      setState("error");
    }
  }, [presentProduct]);

  // Pencarian produk secara live saat search sheet terbuka
  useEffect(() => {
    if (!searchOpen || sheetMode !== "search") return;
    const q = searchQuery.trim();
    const t = setTimeout(async () => {
      if (!q) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        if (res.ok) {
          const data = (await res.json()) as { results: ScanResult[] };
          setSearchResults(data.results);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [searchQuery, searchOpen, sheetMode]);

  const reset = useCallback(() => {
    setProduct(null);
    setState("idle");
  }, []);

  const handleAddToList = useCallback(() => {
    if (product) addToList(product);
    reset();
  }, [product, addToList, reset]);

  const submitManual = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualCode.trim()) return;
      setManualOpen(false);
      const code = manualCode.trim();
      setManualCode("");
      void lookupProduct(code);
    },
    [manualCode, lookupProduct],
  );

  const openManual = () => {
    if (stateRef.current !== "idle") return;
    setManualOpen(true);
  };

  const openSearch = () => {
    if (stateRef.current !== "idle") return;
    setSheetMode("search");
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(true);
  };

  const pickFromSearch = useCallback(
    (p: Product) => {
      setSearchOpen(false);
      setSearchQuery("");
      setSearchResults([]);
      setCapturedImage(null);
      presentProduct(p);
    },
    [presentProduct],
  );

  // Foto: bandingkan gambar (kamera/gallery) dengan foto produk di database
  const matchImage = useCallback(async (dataUrl: string) => {
    setState("fetching");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          results: ScanResult[];
          hasImageProducts: boolean;
        };
        setCapturedImage(dataUrl);
        setNoPhotoProducts(data.hasImageProducts === false);
        setSearchResults(data.results);
        setSearchQuery("");
        setSheetMode("photo");
        setSearchOpen(true);
        setState("idle");
      } else {
        setCapturedImage(null);
        setOcrText("");
        setState("error");
      }
    } catch {
      setCapturedImage(null);
      setOcrText("");
      setState("error");
    }
  }, []);

  const runPhotoMatch = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, 480 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    await matchImage(dataUrl);
  }, [matchImage]);

  const handleFileForMatch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setState("fetching");
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 480 / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          void matchImage(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => {
          setCapturedImage(null);
          setState("error");
        };
        img.src = String(reader.result);
      };
      reader.onerror = () => {
        setCapturedImage(null);
        setState("error");
      };
      reader.readAsDataURL(file);
    },
    [matchImage],
  );

  const handleFlash = () => {
    setFlashOn((v) => !v);
  };

  // Layout adjustments per state
  useEffect(() => {
    const status = statusRef.current;
    const sheet = sheetRef.current;
    const laser = laserRef.current;
    if (!status || !sheet || !laser) return;

    if (state === "idle") {
      status.style.height = "72px";
      sheet.style.transform = "translateY(0)";
      laser.style.display = "block";
    } else if (state === "fetching") {
      status.style.height = "100px";
      sheet.style.transform = "translateY(0)";
      laser.style.display = "block";
    } else if (state === "success") {
      status.style.height = "200px";
      sheet.style.transform = "translateY(-60px)";
      laser.style.display = "none";
    } else if (state === "error") {
      status.style.height = "200px";
      sheet.style.transform = "translateY(-40px)";
      laser.style.display = "none";
    }
  }, [state]);

  const cornerColor =
    state === "fetching" ? "bg-primary" : state === "success" ? "bg-green-500" : state === "error" ? "bg-error" : "bg-surface-container-lowest";

  return (
    <div className="relative flex h-screen w-full flex-col bg-background">
      <div className="flex h-full w-full flex-col">
        {/* Viewfinder & Camera Area */}
        <div className="relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden bg-surface">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-on-background/30 backdrop-blur-[2px]" />

          <div className="absolute inset-0 flex items-center justify-center p-margin-mobile">
            <div className="relative aspect-square w-3/4 max-w-[280px]" id="scanner-frame">
              {CORNERS.map((corner) => {
                const isH = corner.endsWith("-h");
                const pos = corner.slice(0, 2);
                const hPos =
                  pos === "tl" ? "top-0 left-0" : pos === "tr" ? "top-0 right-0" : pos === "bl" ? "bottom-0 left-0" : "bottom-0 right-0";
                return (
                  <div
                    key={corner}
                    className={`absolute ${hPos} rounded-full transition-colors duration-300 ${isH ? "h-xs w-xl" : "h-xl w-xs"} ${cornerColor}`}
                  />
                );
              })}
              <div
                ref={laserRef}
                className="laser-line absolute left-4 right-4 h-0.5 bg-primary shadow-[0_0_8px_2px_rgba(124,58,237,0.5)]"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="relative z-10 flex items-center justify-center gap-lg px-margin-mobile pb-margin-desktop">
            <button
              type="button"
              onClick={handleFlash}
              className="flex flex-col items-center justify-center gap-sm"
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg backdrop-blur-md transition-transform active:scale-95 ${
                  flashOn ? "bg-primary/60" : "bg-surface-container-lowest/20"
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[24px] ${flashOn ? "text-white" : "text-on-tertiary"}`}
                >
                  {flashOn ? "flashlight_off" : "flashlight_on"}
                </span>
              </div>
              <span className="font-label-caps text-label-caps text-on-tertiary drop-shadow-md">
                Flash
              </span>
            </button>

            <button
              type="button"
              onClick={openSearch}
              className="flex flex-col items-center justify-center gap-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest/20 shadow-lg backdrop-blur-md transition-transform active:scale-95">
                <span className="material-symbols-outlined text-on-tertiary text-[24px]">
                  search
                </span>
              </div>
              <span className="font-label-caps text-label-caps text-on-tertiary drop-shadow-md">
                Cari
              </span>
            </button>

            <button
              type="button"
              onClick={() => void runPhotoMatch()}
              className="flex flex-col items-center justify-center gap-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest/20 shadow-lg backdrop-blur-md transition-transform active:scale-95">
                <span className="material-symbols-outlined text-on-tertiary text-[24px]">
                  photo_camera
                </span>
              </div>
              <span className="font-label-caps text-label-caps text-on-tertiary drop-shadow-md">
                Foto
              </span>
            </button>

            <button
              type="button"
              onClick={openManual}
              className="flex flex-col items-center justify-center gap-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest/20 shadow-lg backdrop-blur-md transition-transform active:scale-95">
                <span className="material-symbols-outlined text-on-tertiary text-[24px]">
                  keyboard
                </span>
              </div>
              <span className="font-label-caps text-label-caps text-on-tertiary drop-shadow-md">
                Manual
              </span>
            </button>

            <button
              type="button"
              onClick={() => void runOcr()}
              className="flex flex-col items-center justify-center gap-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest/20 shadow-lg backdrop-blur-md transition-transform active:scale-95">
                <span className="material-symbols-outlined text-on-tertiary text-[24px]">
                  document_scanner
                </span>
              </div>
              <span className="font-label-caps text-label-caps text-on-tertiary drop-shadow-md">
                OCR
              </span>
            </button>
          </div>
        </div>

        {/* Slide-up Bottom Sheet */}
        <div className="relative z-20 flex-1 bg-background">
          <div
            ref={sheetRef}
            className="sheet-transition -mt-lg flex w-full flex-col items-center rounded-t-[16px] bg-surface-container-lowest p-margin-mobile pt-sm shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
          >
            <div className="mb-md h-[4px] w-12 shrink-0 rounded-full bg-surface-variant" />

            <div className="relative w-full overflow-hidden" ref={statusRef}>
              {/* Idle */}
              <div
                className={`absolute inset-0 flex w-full items-center justify-between rounded-2xl bg-primary/10 p-md transition-opacity duration-300 ${
                  state === "idle" ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="flex items-center gap-md">
                  <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-primary shadow-md">
                    <span className="material-symbols-outlined text-on-primary text-[20px]">
                      document_scanner
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-md text-headline-md text-primary">
                      Siap scan
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Arahkan barcode atau label produk
                    </span>
                  </div>
                </div>
                <span className="material-symbols-outlined text-primary text-[24px]">
                  expand_less
                </span>
              </div>

              {/* Fetching */}
              <div
                className={`absolute inset-0 flex w-full items-center justify-center rounded-2xl bg-surface p-md transition-opacity duration-300 ${
                  state === "fetching" ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <div className="flex flex-col items-center gap-sm">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                  <span className="font-body-sm text-on-surface-variant">
                    Mencari produk...
                  </span>
                </div>
              </div>

              {/* Success */}
              {product && (
                <div
                  className={`absolute inset-0 flex w-full flex-col rounded-2xl bg-surface p-0 transition-opacity duration-300 ${
                    state === "success" ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  <div className="mb-md flex gap-md">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container">
                      <span className="material-symbols-outlined text-surface-variant text-[40px]">
                        image
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col">
                      <span className="font-headline-md text-headline-md mb-1 line-clamp-2 leading-tight text-on-surface">
                        {product.name}
                      </span>
                      <span className="mb-2 text-[24px] font-bold text-on-surface">
                        {formatPrice(product.price)}
                      </span>
                      <div className="flex items-center gap-xs text-primary">
                        <span className="material-symbols-outlined text-[16px]">
                          check_circle
                        </span>
                        <span className="font-body-sm font-semibold">
                          In Stock - Aisle {product.aisle}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto flex gap-sm">
                    <button
                      type="button"
                      onClick={reset}
                      className="flex-1 rounded-full border border-outline py-3 font-label-caps text-label-caps text-on-surface"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleAddToList}
                      className="flex-1 rounded-full bg-primary py-3 font-label-caps text-label-caps text-on-primary"
                    >
                      Tambah ke Daftar
                    </button>
                  </div>
                </div>
              )}

              {/* Error */}
              <div
                className={`absolute inset-0 flex w-full flex-col items-center justify-center rounded-2xl bg-error/10 p-md text-center transition-opacity duration-300 ${
                  state === "error" ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              >
                <span className="material-symbols-outlined text-error mb-2 text-[40px]">
                  error
                </span>
                <span className="font-headline-md text-headline-md text-error mb-1">
                  Produk tidak ditemukan
                </span>
                <span className="font-body-sm text-on-surface-variant mb-2">
                  {ocrText
                    ? `Kamera membaca: "${ocrText.slice(0, 120)}"`
                    : "Barcode atau teks tidak dikenali."}
                </span>
                <div className="flex gap-sm">
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-full bg-error px-6 py-2 font-label-caps text-label-caps text-on-error"
                  >
                    Coba Lagi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOcrText("");
                      setState("idle");
                      setSearchOpen(true);
                    }}
                    className="rounded-full border border-outline px-6 py-2 font-label-caps text-label-caps text-on-surface"
                  >
                    Cari Nama
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Input Modal */}
      {manualOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-on-background/50 p-margin-mobile pb-margin-desktop"
          onClick={() => setManualOpen(false)}
        >
          <form
            onSubmit={submitManual}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-2xl bg-surface-container-lowest p-md shadow-xl"
          >
            <div className="mb-md flex items-center justify-between">
              <span className="font-headline-md text-headline-md text-on-surface">
                Masukkan barcode
              </span>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <input
              autoFocus
              inputMode="numeric"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="e.g. 036000291452"
              className="w-full rounded-xl border border-outline-variant bg-surface px-4 py-3 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              className="mt-md w-full rounded-full bg-primary py-3 font-label-caps text-label-caps text-on-primary"
            >
              Cari
            </button>
          </form>
        </div>
      )}

      {/* Search / Photo match Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-on-background/50 p-margin-mobile pb-margin-desktop"
          onClick={() => {
            setSearchOpen(false);
            setSheetMode("search");
            setCapturedImage(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-2xl bg-surface-container-lowest p-md shadow-xl"
          >
            <div className="mb-md flex items-center justify-between">
              <span className="font-headline-md text-headline-md text-on-surface">
                {sheetMode === "photo" ? "Hasil Foto" : "Cari Produk"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSheetMode("search");
                  setCapturedImage(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {sheetMode === "photo" ? (
              <>
                <div className="mb-md flex items-center gap-sm rounded-2xl bg-surface p-sm">
                  {capturedImage && (
                    <img
                      src={capturedImage}
                      alt="Foto yang diambil"
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-body-sm font-semibold text-on-surface">
                      Produk paling mirip
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      Pilih yang sesuai, atau foto ulang.
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-sm">
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="flex items-center gap-xs rounded-full border border-outline px-4 py-2 font-label-caps text-label-caps text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[16px]">photo_library</span>
                      Galeri
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSheetMode("search");
                        setCapturedImage(null);
                        setState("idle");
                        void runPhotoMatch();
                      }}
                      className="flex items-center gap-xs rounded-full bg-primary px-4 py-2 font-label-caps text-label-caps text-on-primary"
                    >
                      <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                      Foto Ulang
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="relative mb-md">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                  search
                </span>
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik nama produk..."
                  className="w-full rounded-xl border border-outline-variant bg-surface py-3 pl-10 pr-4 font-body-lg text-body-lg text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none"
                />
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {searching ? (
                <div className="flex items-center justify-center py-xl">
                  <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                </div>
              ) : searchResults.length > 0 ? (
                <ul className="flex flex-col gap-xs">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickFromSearch(p)}
                        className="flex w-full items-center gap-md rounded-xl p-sm text-left transition-colors hover:bg-surface-container"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container">
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-surface-variant text-[22px]">
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
                          {typeof p.matchScore === "number" && (
                            <span
                              className={`rounded-full px-2 py-0.5 font-label-caps text-label-caps ${
                                p.matchScore >= 85
                                  ? "bg-green-100 text-green-700"
                                  : p.matchScore >= 65
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-surface-variant text-on-surface-variant"
                              }`}
                            >
                              {p.matchScore >= 85
                                ? "Sangat mirip"
                                : p.matchScore >= 65
                                  ? "Mirip"
                                  : "Mungkin cocok"}{" "}
                              {p.matchScore}%
                            </span>
                          )}
                          <span className="font-body-lg text-body-lg font-semibold text-on-surface">
                            {formatPrice(p.price)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : sheetMode === "photo" ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-surface p-xl text-center">
                  <span className="material-symbols-outlined text-surface-variant mb-md text-[40px]">
                    search_off
                  </span>
                  <span className="font-headline-md text-headline-md text-on-surface mb-sm">
                    Tidak ada yang cocok
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {noPhotoProducts
                      ? "Belum ada produk dengan foto di database. Daftarkan produk beserta fotonya di halaman Admin agar bisa dicocokkan."
                      : "Foto tidak cocok dengan produk mana pun. Coba foto ulang, pilih dari galeri, atau cari manual."}
                  </span>
                  <div className="mt-md flex flex-wrap items-center justify-center gap-sm">
                    <button
                      type="button"
                      onClick={() => setSheetMode("search")}
                      className="rounded-full bg-primary px-5 py-2 font-label-caps text-label-caps text-on-primary"
                    >
                      Cari Nama
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="rounded-full border border-outline px-5 py-2 font-label-caps text-label-caps text-on-surface"
                    >
                      Pilih dari galeri
                    </button>
                  </div>
                </div>
              ) : searchQuery.trim() ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-surface p-xl text-center">
                  <span className="material-symbols-outlined text-surface-variant mb-md text-[40px]">
                    search_off
                  </span>
                  <span className="font-headline-md text-headline-md text-on-surface mb-sm">
                    Tidak ditemukan
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Coba kata kunci lain, atau daftarkan produk di halaman Admin.
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center py-xl">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Ketik nama produk untuk mencari.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileForMatch}
      />
    </div>
  );
}
