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
};

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const HIST_BINS = 64;

function histogramPixels(data: Buffer, pixelCount: number): number[] {
  const bins = new Array<number>(HIST_BINS).fill(0);
  for (let i = 0; i < pixelCount; i++) {
    const r = data[i * 4] >> 6;
    const g = data[i * 4 + 1] >> 6;
    const b = data[i * 4 + 2] >> 6;
    bins[(r << 4) | (g << 2) | b]++;
  }
  if (pixelCount > 0) {
    for (let i = 0; i < HIST_BINS; i++) bins[i] /= pixelCount;
  }
  return bins;
}

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
  const color = img.clone().resize({ w: 16, h: 16 });

  const signature: Signature = {
    a: `${channelHashPixels(small.bitmap.data, 0)}${channelHashPixels(small.bitmap.data, 1)}${channelHashPixels(small.bitmap.data, 2)}`,
    h: histogramPixels(color.bitmap.data, 16 * 16),
    c: averageColor(color.bitmap.data, 16 * 16),
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
  if (typeof A?.a !== "string" || typeof B?.a !== "string") return 0;
  if (A.a.length !== B.a.length || A.a.length !== 48) return 0;

  let x = BigInt(`0x${A.a}`) ^ BigInt(`0x${B.a}`);
  let dist = 0;
  while (x > BigInt(0)) {
    dist += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  const aSim = 1 - dist / 192;

  const ha = A.h ?? [];
  const hb = B.h ?? [];
  const len = Math.min(ha.length, hb.length);
  let inter = 0;
  for (let i = 0; i < len; i++) inter += Math.min(ha[i], hb[i]);
  const hSim = inter;

  const ca = A.c ?? [];
  const cb = B.c ?? [];
  if (ca.length === 0 || cb.length === 0) {
    return 0.5 * aSim + 0.5 * hSim;
  }
  const clen = Math.min(ca.length, cb.length);
  let colorDist = 0;
  for (let i = 0; i < clen; i++) colorDist += Math.abs(ca[i] - cb[i]);
  const cSim = 1 - colorDist / clen;

  return 0.35 * aSim + 0.35 * hSim + 0.3 * cSim;
}