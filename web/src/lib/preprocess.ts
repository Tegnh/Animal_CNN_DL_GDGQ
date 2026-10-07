// Browser copy of the Python preprocessing, so both give the same probabilities:
// EXIF fix -> RGB -> shrink to max side 384 -> tf.image.resize bilinear to 224×224.
// Small JPEGs skip the browser's decoder for a TensorFlow-identical one (see jpeg.ts).

import { decodeJpeg } from './jpeg';

export const INPUT_SIZE = 224;
const MAX_SIDE = 384;

export class UnsupportedImageError extends Error {
  /** 'heic' when the file is a HEIF/HEIC photo this browser cannot decode. */
  readonly reason: 'unreadable' | 'heic';
  constructor(reason: 'unreadable' | 'heic' = 'unreadable') {
    super(reason);
    this.reason = reason;
  }
}

export interface Preprocessed {
  /** NHWC float32, raw 0-255 values, length 224*224*3. */
  data: Float32Array;
  /** The exact 224×224 pixels the models receive, for display. */
  preview: ImageData;
  source: { width: number; height: number };
  shrunk: { width: number; height: number } | null;
  /** Which JPEG decoder produced the pixels. */
  decoder: 'tensorflow-compatible' | 'browser';
  ms: { decode: number; shrink: number; resize: number };
}

/**
 * tf.image.resize(method="bilinear", antialias=False): half-pixel centres,
 * neighbours clamped to the image. Input is RGBA, output is RGB floats.
 */
export function resizeBilinear(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH * 3);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  const x0 = new Int32Array(dstW);
  const x1 = new Int32Array(dstW);
  const fx = new Float32Array(dstW);
  for (let x = 0; x < dstW; x++) {
    const pos = (x + 0.5) * scaleX - 0.5;
    const floor = Math.floor(pos);
    x0[x] = Math.max(floor, 0);
    x1[x] = Math.min(Math.ceil(pos), srcW - 1);
    fx[x] = pos - floor;
  }

  for (let y = 0; y < dstH; y++) {
    const pos = (y + 0.5) * scaleY - 0.5;
    const floor = Math.floor(pos);
    const top = Math.max(floor, 0) * srcW;
    const bottom = Math.min(Math.ceil(pos), srcH - 1) * srcW;
    const fy = pos - floor;
    for (let x = 0; x < dstW; x++) {
      const tl = (top + x0[x]) * 4;
      const tr = (top + x1[x]) * 4;
      const bl = (bottom + x0[x]) * 4;
      const br = (bottom + x1[x]) * 4;
      const o = (y * dstW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const upper = src[tl + c] + (src[tr + c] - src[tl + c]) * fx[x];
        const lower = src[bl + c] + (src[br + c] - src[bl + c]) * fx[x];
        out[o + c] = upper + (lower - upper) * fy;
      }
    }
  }
  return out;
}

/**
 * JPEGs that are already dataset-sized (no shrink step) are decoded exactly as
 * TensorFlow decoded them for training and for the reference predictions.
 * Returns null for everything else.
 */
async function decodeLikeTensorFlow(blob: Blob) {
  // Dataset-sized JPEGs are small. Skip the full read for big files (phone photos).
  if (blob.size > 3 * 1024 * 1024) return null;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    return decodeJpeg(bytes, MAX_SIDE);
  } catch {
    return null;
  }
}

interface BrowserImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** HEIC/HEIF files start with an ISO-BMFF 'ftyp' box whose brand names the format. */
async function looksLikeHeic(blob: Blob): Promise<boolean> {
  if (/hei[cf]|hevc/i.test(blob.type)) return true;
  try {
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const text = String.fromCharCode(...head.subarray(4, 12));
    return text.startsWith('ftyp') && /^ftyp(hei[cxms]|hev[cx]|mif1|msf1)/.test(text);
  } catch {
    return false;
  }
}

/**
 * Browser decode with EXIF rotation applied. createImageBitmap options are not accepted
 * everywhere (older Safari rejects unknown enum values), so the fallback is an <img>,
 * which every browser rotates by default and which is how Safari reads HEIC.
 */
async function decodeWithBrowser(blob: Blob): Promise<BrowserImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'none' keeps the file's own pixel values, as PIL does (no colour-profile conversion).
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('image failed to load'));
      element.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new UnsupportedImageError((await looksLikeHeic(blob)) ? 'heic' : 'unreadable');
  }
}

export async function preprocess(blob: Blob): Promise<Preprocessed> {
  let t = performance.now();
  let pixels: Uint8ClampedArray;
  let width: number;
  let height: number;
  let source: { width: number; height: number };
  let decode: number;
  let shrink = 0;
  let ratio = 1;

  const exact = await decodeLikeTensorFlow(blob);
  if (exact) {
    ({ data: pixels, width, height } = exact);
    source = { width, height };
    decode = performance.now() - t;
  } else {
    const image = await decodeWithBrowser(blob);
    source = { width: image.width, height: image.height };
    decode = performance.now() - t;

    t = performance.now();
    const longSide = Math.max(source.width, source.height);
    ratio = longSide > MAX_SIDE ? MAX_SIDE / longSide : 1;
    width = Math.max(1, Math.round(source.width * ratio));
    height = Math.max(1, Math.round(source.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new UnsupportedImageError();
    // Transparent pixels become white, as in the training pipeline.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, width, height);
    image.release();
    pixels = ctx.getImageData(0, 0, width, height).data;
    shrink = performance.now() - t;
  }

  t = performance.now();
  const data = resizeBilinear(pixels, width, height, INPUT_SIZE, INPUT_SIZE);
  const resize = performance.now() - t;

  const preview = new ImageData(INPUT_SIZE, INPUT_SIZE);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    preview.data[j] = data[i];
    preview.data[j + 1] = data[i + 1];
    preview.data[j + 2] = data[i + 2];
    preview.data[j + 3] = 255;
  }

  return {
    data,
    preview,
    source,
    shrunk: ratio < 1 ? { width, height } : null,
    decoder: exact ? 'tensorflow-compatible' : 'browser',
    ms: { decode, shrink, resize },
  };
}
