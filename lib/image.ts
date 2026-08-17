import { Jimp } from "jimp";

type LoadedImage = Awaited<ReturnType<typeof Jimp.read>>;

export type ImageInfo = {
  image: string;
  signature: string;
};

export type Signature = {
  a: string;
  h: number[];
  c: number[];
  p?: string;
};

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const HIST_BITS = 4;
const HIST_BINS = 1 << (3 * HIST_BITS);
const HIST_SHIFT = 8 - HIST_BITS;
const HIST_SIZE = 64;
const PHASH_SIZE = 32;

function averageColor(data: Buffer, pixelCount: number): number[] {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < pixelCount; i++) {
    r += data[i * 4];
    g += data[i * 4 + 1];
    b += data[i * 4 + 2];
  }
  return [r / pixelCount / 255, g / pixelCount / 255, b / pixelCount / 255];
}

// Per-channel average hash: 3 x 64 bit, hex-packed into 48 chars.
// Kept for backward compatibility with older database entries.
function channelHashPixels(data: Buffer, channel: number): string {
  let mean = 0;
  const vals: number[] = [];
  for (let i = 0; i < 64; i++) {
    const v = data[i * 4 + channel];
    vals.push(v);
    mean += v;
  }
  mean /= 64;
  let hash = BigInt(0);
  for (let i = 0; i < 64; i++) {
    hash = (hash << BigInt(1)) | BigInt(vals[i] >= mean ? 1 : 0);
  }
  return hash.toString(16).padStart(16, "0");
}

// Fine color histogram (4096 bins) computed after stretching brightness to the
// full range. Stretching makes the histogram tolerant to lighting differences
// between photos, while the fine bins still separate products with different
// color palettes (a coarse histogram merges all "white-ish" colors and causes
// false positives between unrelated products photographed on the same shelf).
function histogramPixels(data: Buffer, pixelCount: number): number[] {
  let min = 255;
  let max = 0;
  const lums = new Array<number>(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const lum = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    lums[i] = lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const span = Math.max(1, max - min);
  const bins = new Array<number>(HIST_BINS).fill(0);
  for (let i = 0; i < pixelCount; i++) {
    const k = 255 / span;
    const r = Math.max(0, Math.min(255, Math.round((data[i * 4] - min) * k)));
    const g = Math.max(0, Math.min(255, Math.round((data[i * 4 + 1] - min) * k)));
    const b = Math.max(0, Math.min(255, Math.round((data[i * 4 + 2] - min) * k)));
    const rq = r >> HIST_SHIFT;
    const gq = g >> HIST_SHIFT;
    const bq = b >> HIST_SHIFT;
    bins[(rq << (2 * HIST_BITS)) | (gq << HIST_BITS) | bq]++;
  }
  if (pixelCount > 0) {
    for (let i = 0; i < HIST_BINS; i++) bins[i] /= pixelCount;
  }
  return bins;
}

function grayscaleValues(data: Buffer, size: number): number[] {
  const out = new Array<number>(size * size);
  for (let i = 0; i < size * size; i++) {
    out[i] =
      0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return out;
}

// DCT-based perceptual hash (like pHash): 64 bits, hex-packed into 16 chars.
// Captures image structure instead of just overall brightness/color, so it is
// far more discriminative between different products.
function dctPhash(gray: number[], size: number): string {
  const coefs: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      const cu = u === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
      const cv = v === 0 ? Math.sqrt(1 / size) : Math.sqrt(2 / size);
      let sum = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          sum +=
            gray[y * size + x] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }
      coefs.push(cu * cv * sum);
    }
  }
  const mean = coefs.slice(1).reduce((s, v) => s + v, 0) / (coefs.length - 1);
  let hash = BigInt(0);
  for (const c of coefs) {
    hash = (hash << BigInt(1)) | BigInt(c >= mean ? 1 : 0);
  }
  return hash.toString(16).padStart(16, "0");
}

function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let dist = 0;
  while (x > BigInt(0)) {
    dist += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return dist;
}

export async function processImage(dataUrl: string): Promise<ImageInfo | null> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_INPUT_BYTES) return null;

  let img: LoadedImage;
  try {
    img = await Jimp.read(buf);
  } catch {
    return null;
  }
  if (!img.bitmap.width || !img.bitmap.height) return null;

  const small = img.clone().resize({ w: 8, h: 8 });
  const color = img.clone().resize({ w: HIST_SIZE, h: HIST_SIZE });
  const struct = img.clone().resize({ w: PHASH_SIZE, h: PHASH_SIZE });

  const signature: Signature = {
    a: `${channelHashPixels(small.bitmap.data, 0)}${channelHashPixels(small.bitmap.data, 1)}${channelHashPixels(small.bitmap.data, 2)}`,
    h: histogramPixels(color.bitmap.data, HIST_SIZE * HIST_SIZE),
    c: averageColor(color.bitmap.data, HIST_SIZE * HIST_SIZE),
    p: dctPhash(grayscaleValues(struct.bitmap.data, PHASH_SIZE), PHASH_SIZE),
  };

  const thumb = img.clone().resize({ w: 160 });
  const image = await thumb.getBase64("image/jpeg");

  return { image, signature: JSON.stringify(signature) };
}

export function compareSignatures(a: string, b: string): number {
  let A: Signature;
  let B: Signature;
  try {
    A = JSON.parse(a) as Signature;
    B = JSON.parse(b) as Signature;
  } catch {
    return 0;
  }

  // Structural similarity: prefer the DCT perceptual hash when available,
  // fall back to the legacy average hash for old database entries.
  let structSim: number;
  if (
    typeof A?.p === "string" &&
    typeof B?.p === "string" &&
    A.p.length === 16 &&
    B.p.length === 16
  ) {
    structSim = 1 - hammingDistance(A.p, B.p) / 64;
  } else if (
    typeof A?.a === "string" &&
    typeof B?.a === "string" &&
    A.a.length === 48 &&
    B.a.length === 48
  ) {
    structSim = 1 - hammingDistance(A.a, B.a) / 192;
  } else {
    return 0;
  }

  const ha = A.h ?? [];
  const hb = B.h ?? [];
  let hSim = 0.5;
  if (ha.length > 0 && ha.length === hb.length) {
    let inter = 0;
    for (let i = 0; i < ha.length; i++) inter += Math.min(ha[i], hb[i]);
    hSim = inter;
  }

  const ca = A.c ?? [];
  const cb = B.c ?? [];
  let cSim = 0.5;
  if (ca.length > 0 && cb.length > 0) {
    const clen = Math.min(ca.length, cb.length);
    let colorDist = 0;
    for (let i = 0; i < clen; i++) colorDist += Math.abs(ca[i] - cb[i]);
    cSim = 1 - colorDist / clen;
  }

  let score = 0.55 * structSim + 0.3 * hSim + 0.15 * cSim;

  // Safety gate: if both images use fine histograms, derive a coarse
  // histogram and reject comparisons with essentially no overlapping color
  // palette. This prevents near-uniform (flat) images, where the perceptual
  // hash is not meaningful, from matching just because they are "simple".
  if (ha.length === HIST_BINS && hb.length === HIST_BINS) {
    const coarseA = new Array<number>(64).fill(0);
    const coarseB = new Array<number>(64).fill(0);
    for (let i = 0; i < HIST_BINS; i++) {
      const r = i >> 8;
      const g = (i >> 4) & 0xf;
      const b = i & 0xf;
      const ci = ((r >> 2) << 4) | ((g >> 2) << 2) | (b >> 2);
      coarseA[ci] += ha[i];
      coarseB[ci] += hb[i];
    }
    let coarse = 0;
    for (let i = 0; i < 64; i++) coarse += Math.min(coarseA[i], coarseB[i]);
    const gate = Math.min(1, coarse / 0.15);
    score *= gate;
  }

  return score;
}