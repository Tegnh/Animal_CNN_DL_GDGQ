// A small baseline JPEG decoder that reproduces tf.io.decode_jpeg bit for bit.
//
// Why it exists: TensorFlow decodes JPEGs with libjpeg-turbo's *fast* integer IDCT
// (jidctfst), browsers use the accurate one. The pixels differ by a level or two,
// which is enough to move a probability by a few percent. The reference predictions
// were made by TensorFlow, so the dataset-sized sample images are decoded here the
// same way: fast IDCT, "fancy" (triangle) chroma upsampling, libjpeg colour tables.
//
// Scope: 8-bit baseline/extended-sequential Huffman JPEGs, one interleaved scan,
// greyscale or YCbCr with 4:4:4, 4:2:2 or 4:2:0 sampling. Anything else throws and
// the caller falls back to the browser's own decoder.

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  data: Uint8ClampedArray;
}

export class UnsupportedJpegError extends Error {}

const ZIGZAG = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7,
  14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39,
  46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

// libjpeg's AA&N scale factors (14-bit), folded into the quantisation table.
const AAN_SCALES = new Int32Array([
  16384, 22725, 21407, 19266, 16384, 12873, 8867, 4520, 22725, 31521, 29692, 26722, 22725, 17855, 12299,
  6270, 21407, 29692, 27969, 25172, 21407, 16819, 11585, 5906, 19266, 26722, 25172, 22654, 19266, 15137,
  10426, 5315, 16384, 22725, 21407, 19266, 16384, 12873, 8867, 4520, 12873, 17855, 16819, 15137, 12873,
  10114, 6967, 3552, 8867, 12299, 11585, 10426, 8867, 6967, 4799, 2446, 4520, 6270, 5906, 5315, 4520, 3552,
  2446, 1247,
]);

interface HuffmanTable {
  maxCode: Int32Array;
  valPtr: Int32Array;
  minCode: Int32Array;
  values: Uint8Array;
}

interface Component {
  id: number;
  h: number;
  v: number;
  quant: Int32Array;
  dc: HuffmanTable;
  ac: HuffmanTable;
  pred: number;
  blocksPerLine: number;
  plane: Uint8Array;
  stride: number;
  /** Real (unpadded) size of the plane. */
  width: number;
  height: number;
}

function buildHuffman(counts: Uint8Array, values: Uint8Array): HuffmanTable {
  const maxCode = new Int32Array(18).fill(-1);
  const minCode = new Int32Array(17);
  const valPtr = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    valPtr[length] = k;
    minCode[length] = code;
    code += counts[length - 1];
    k += counts[length - 1];
    maxCode[length] = counts[length - 1] ? code - 1 : -1;
    code <<= 1;
  }
  return { maxCode, valPtr, minCode, values };
}

// jidctfst.c: 8-bit constants, results truncated (not rounded) exactly as libjpeg does.
const F_1_082 = 277;
const F_1_414 = 362;
const F_1_847 = 473;
const F_2_613 = 669;
const work = new Int32Array(64);

function idctFast(coef: Int32Array, quant: Int32Array, out: Uint8Array, offset: number, stride: number) {
  for (let c = 0; c < 8; c++) {
    let tmp0 = coef[c] * quant[c];
    let tmp1 = coef[16 + c] * quant[16 + c];
    let tmp2 = coef[32 + c] * quant[32 + c];
    let tmp3 = coef[48 + c] * quant[48 + c];
    let tmp10 = tmp0 + tmp2;
    let tmp11 = tmp0 - tmp2;
    let tmp13 = tmp1 + tmp3;
    let tmp12 = (((tmp1 - tmp3) * F_1_414) >> 8) - tmp13;
    tmp0 = tmp10 + tmp13;
    tmp3 = tmp10 - tmp13;
    tmp1 = tmp11 + tmp12;
    tmp2 = tmp11 - tmp12;

    let tmp4 = coef[8 + c] * quant[8 + c];
    let tmp5 = coef[24 + c] * quant[24 + c];
    let tmp6 = coef[40 + c] * quant[40 + c];
    let tmp7 = coef[56 + c] * quant[56 + c];
    const z13 = tmp6 + tmp5;
    const z10 = tmp6 - tmp5;
    const z11 = tmp4 + tmp7;
    const z12 = tmp4 - tmp7;
    tmp7 = z11 + z13;
    tmp11 = ((z11 - z13) * F_1_414) >> 8;
    const z5 = ((z10 + z12) * F_1_847) >> 8;
    tmp10 = ((z12 * F_1_082) >> 8) - z5;
    tmp12 = ((z10 * -F_2_613) >> 8) + z5;
    tmp6 = tmp12 - tmp7;
    tmp5 = tmp11 - tmp6;
    tmp4 = tmp10 + tmp5;

    work[c] = tmp0 + tmp7;
    work[56 + c] = tmp0 - tmp7;
    work[8 + c] = tmp1 + tmp6;
    work[48 + c] = tmp1 - tmp6;
    work[16 + c] = tmp2 + tmp5;
    work[40 + c] = tmp2 - tmp5;
    work[32 + c] = tmp3 + tmp4;
    work[24 + c] = tmp3 - tmp4;
  }

  for (let r = 0; r < 8; r++) {
    const w = r * 8;
    const tmp10 = work[w] + work[w + 4];
    const tmp11 = work[w] - work[w + 4];
    const tmp13 = work[w + 2] + work[w + 6];
    const tmp12 = (((work[w + 2] - work[w + 6]) * F_1_414) >> 8) - tmp13;
    const tmp0 = tmp10 + tmp13;
    const tmp3 = tmp10 - tmp13;
    const tmp1 = tmp11 + tmp12;
    const tmp2 = tmp11 - tmp12;

    const z13 = work[w + 5] + work[w + 3];
    const z10 = work[w + 5] - work[w + 3];
    const z11 = work[w + 1] + work[w + 7];
    const z12 = work[w + 1] - work[w + 7];
    const tmp7 = z11 + z13;
    const t11 = ((z11 - z13) * F_1_414) >> 8;
    const z5 = ((z10 + z12) * F_1_847) >> 8;
    const t10 = ((z12 * F_1_082) >> 8) - z5;
    const t12 = ((z10 * -F_2_613) >> 8) + z5;
    const tmp6 = t12 - tmp7;
    const tmp5 = t11 - tmp6;
    const tmp4 = t10 + tmp5;

    const o = offset + r * stride;
    out[o] = clamp(((tmp0 + tmp7) >> 5) + 128);
    out[o + 7] = clamp(((tmp0 - tmp7) >> 5) + 128);
    out[o + 1] = clamp(((tmp1 + tmp6) >> 5) + 128);
    out[o + 6] = clamp(((tmp1 - tmp6) >> 5) + 128);
    out[o + 2] = clamp(((tmp2 + tmp5) >> 5) + 128);
    out[o + 5] = clamp(((tmp2 - tmp5) >> 5) + 128);
    out[o + 4] = clamp(((tmp3 + tmp4) >> 5) + 128);
    out[o + 3] = clamp(((tmp3 - tmp4) >> 5) + 128);
  }
}

const clamp = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : value);

/** jdsample.c h2v1_fancy_upsample: doubles the width with a 3:1 triangle filter. */
function upsampleH2V1(c: Component, outWidth: number): Uint8Array {
  const out = new Uint8Array(outWidth * c.height);
  const row = new Uint8Array(c.width * 2);
  for (let y = 0; y < c.height; y++) {
    const p = y * c.stride;
    const last = c.width - 1;
    if (last === 0) {
      row[0] = row[1] = c.plane[p];
    } else {
      row[0] = c.plane[p];
      row[1] = (c.plane[p] * 3 + c.plane[p + 1] + 2) >> 2;
      for (let x = 1; x < last; x++) {
        const value = c.plane[p + x] * 3;
        row[2 * x] = (value + c.plane[p + x - 1] + 1) >> 2;
        row[2 * x + 1] = (value + c.plane[p + x + 1] + 2) >> 2;
      }
      row[2 * last] = (c.plane[p + last] * 3 + c.plane[p + last - 1] + 1) >> 2;
      row[2 * last + 1] = c.plane[p + last];
    }
    out.set(row.subarray(0, outWidth), y * outWidth);
  }
  return out;
}

/** jdsample.c h2v2_fancy_upsample: doubles both ways, 9:3:3:1 weights. */
function upsampleH2V2(c: Component, outWidth: number, outHeight: number): Uint8Array {
  const out = new Uint8Array(outWidth * outHeight);
  const row = new Uint8Array(c.width * 2);
  const last = c.width - 1;
  for (let y = 0; y < c.height; y++) {
    for (let v = 0; v < 2; v++) {
      const outY = 2 * y + v;
      if (outY >= outHeight) continue;
      const near = y * c.stride;
      // The neighbouring row above (v = 0) or below (v = 1); edges repeat themselves.
      const far = Math.min(c.height - 1, Math.max(0, v === 0 ? y - 1 : y + 1)) * c.stride;
      const sum = (x: number) => c.plane[near + x] * 3 + c.plane[far + x];
      if (last === 0) {
        row[0] = (sum(0) * 4 + 8) >> 4;
        row[1] = (sum(0) * 4 + 7) >> 4;
      } else {
        let previous = sum(0);
        let current = sum(0);
        let next = sum(1);
        row[0] = (current * 4 + 8) >> 4;
        row[1] = (current * 3 + next + 7) >> 4;
        for (let x = 1; x < last; x++) {
          previous = current;
          current = next;
          next = sum(x + 1);
          row[2 * x] = (current * 3 + previous + 8) >> 4;
          row[2 * x + 1] = (current * 3 + next + 7) >> 4;
        }
        previous = current;
        current = next;
        row[2 * last] = (current * 3 + previous + 8) >> 4;
        row[2 * last + 1] = (current * 4 + 7) >> 4;
      }
      out.set(row.subarray(0, outWidth), outY * outWidth);
    }
  }
  return out;
}

// jdcolor.c tables, 16-bit fixed point.
const fix = (value: number) => Math.floor(value * 65536 + 0.5);
const CR_R = new Int32Array(256);
const CB_B = new Int32Array(256);
const CR_G = new Int32Array(256);
const CB_G = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  const x = i - 128;
  CR_R[i] = (fix(1.402) * x + 32768) >> 16;
  CB_B[i] = (fix(1.772) * x + 32768) >> 16;
  CR_G[i] = -fix(0.71414) * x;
  CB_G[i] = -fix(0.34414) * x + 32768;
}

/** EXIF orientation from an APP1 segment starting at `start`, or 1 when absent. */
function exifOrientation(bytes: Uint8Array, start: number, end: number): number {
  if (String.fromCharCode(...bytes.subarray(start, start + 4)) !== 'Exif') return 1;
  const tiff = start + 6;
  const little = bytes[tiff] === 0x49;
  const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) => (little ? u16(at) | (u16(at + 2) << 16) : (u16(at) << 16) | u16(at + 2));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

/**
 * @param maxSide Images with a longer side are rejected before any decoding work,
 * so the caller can hand large photos to the browser's decoder instead.
 */
export function decodeJpeg(bytes: Uint8Array, maxSide = Infinity): DecodedImage {
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u16 = () => (bytes[pos++] << 8) | bytes[pos++];
  const unsupported = (why: string): never => {
    throw new UnsupportedJpegError(why);
  };

  if (u16() !== 0xffd8) unsupported('not a JPEG');
  const quantTables: (Int32Array | undefined)[] = [];
  const dcTables: (HuffmanTable | undefined)[] = [];
  const acTables: (HuffmanTable | undefined)[] = [];
  const components: Component[] = [];
  let width = 0;
  let height = 0;
  let restartInterval = 0;
  let scanFound = false;

  while (!scanFound) {
    if (pos >= bytes.length) unsupported('no scan');
    if (u8() !== 0xff) unsupported('bad marker');
    let marker = u8();
    while (marker === 0xff) marker = u8();
    const end = pos + u16();

    if (marker === 0xdb) {
      while (pos < end) {
        const info = u8();
        const table = new Int32Array(64);
        for (let i = 0; i < 64; i++) {
          const q = info >> 4 ? u16() : u8();
          // DESCALE(q * aanscale, CONST_BITS - IFAST_SCALE_BITS), rounded.
          table[ZIGZAG[i]] = (q * AAN_SCALES[ZIGZAG[i]] + 2048) >> 12;
        }
        quantTables[info & 15] = table;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      if (u8() !== 8) unsupported('not 8-bit');
      height = u16();
      width = u16();
      if (Math.max(width, height) > maxSide) unsupported('larger than maxSide');
      const count = u8();
      if (count !== 1 && count !== 3) unsupported('component count');
      for (let i = 0; i < count; i++) {
        const id = u8();
        const sampling = u8();
        const table = quantTables[u8()];
        components.push({
          id,
          h: sampling >> 4,
          v: sampling & 15,
          quant: table ?? unsupported('missing quantisation table'),
          dc: undefined as unknown as HuffmanTable,
          ac: undefined as unknown as HuffmanTable,
          pred: 0,
          blocksPerLine: 0,
          plane: new Uint8Array(0),
          stride: 0,
          width: 0,
          height: 0,
        });
      }
    } else if (marker >= 0xc2 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      unsupported('progressive or lossless');
    } else if (marker === 0xc4) {
      while (pos < end) {
        const info = u8();
        const counts = bytes.subarray(pos, pos + 16);
        pos += 16;
        const total = counts.reduce((a, b) => a + b, 0);
        const table = buildHuffman(counts, bytes.subarray(pos, pos + total));
        pos += total;
        (info >> 4 ? acTables : dcTables)[info & 15] = table;
      }
    } else if (marker === 0xdd) {
      restartInterval = u16();
    } else if (marker === 0xe1) {
      // TensorFlow ignores EXIF rotation; a rotated photo goes to the browser, which applies it.
      if (exifOrientation(bytes, pos, end) > 1) unsupported('EXIF rotation');
    } else if (marker === 0xee) {
      // Adobe marker: transform 1 = YCbCr. Anything else (RGB, CMYK) is left to the browser.
      if (components.length !== 1 && bytes[pos + 11] !== 1) unsupported('Adobe colour transform');
    } else if (marker === 0xda) {
      if (!components.length) unsupported('scan before frame');
      if (u8() !== components.length) unsupported('non-interleaved scans');
      for (const component of components) {
        if (u8() !== component.id) unsupported('scan order');
        const tables = u8();
        component.dc = dcTables[tables >> 4] ?? unsupported('missing DC table');
        component.ac = acTables[tables & 15] ?? unsupported('missing AC table');
      }
      scanFound = true;
    }
    pos = end;
  }

  const grey = components.length === 1;
  if (grey) components[0].h = components[0].v = 1;
  const maxH = components[0].h;
  const maxV = components[0].v;
  if (!grey) {
    const [, cb, cr] = components;
    if (cb.h !== 1 || cb.v !== 1 || cr.h !== 1 || cr.v !== 1) unsupported('chroma sampling');
    if (!((maxH === 1 || maxH === 2) && (maxV === 1 || maxV === 2)) || (maxH === 1 && maxV === 2)) {
      unsupported('luma sampling');
    }
  }

  const mcusX = Math.ceil(width / (8 * maxH));
  const mcusY = Math.ceil(height / (8 * maxV));
  for (const c of components) {
    c.blocksPerLine = mcusX * c.h;
    c.stride = c.blocksPerLine * 8;
    c.plane = new Uint8Array(c.stride * mcusY * c.v * 8);
    c.width = Math.ceil((width * c.h) / maxH);
    c.height = Math.ceil((height * c.v) / maxV);
  }

  // Entropy-coded data: a bit reader that removes 0xFF00 stuffing.
  let bitBuffer = 0;
  let bitCount = 0;
  const readBit = (): number => {
    if (bitCount === 0) {
      let byte = pos < bytes.length ? bytes[pos++] : 0;
      if (byte === 0xff) {
        if (bytes[pos] === 0) pos++;
        else {
          // A marker inside the data: feed zeros, as libjpeg does, and stay on it.
          pos--;
          byte = 0;
        }
      }
      bitBuffer = byte;
      bitCount = 8;
    }
    bitCount--;
    return (bitBuffer >> bitCount) & 1;
  };
  const receive = (length: number): number => {
    let value = 0;
    for (let i = 0; i < length; i++) value = (value << 1) | readBit();
    // Values in the lower half of the range are negative (JPEG "extend").
    return length && value < 1 << (length - 1) ? value - (1 << length) + 1 : value;
  };
  const decodeSymbol = (table: HuffmanTable): number => {
    let code = 0;
    for (let length = 1; length <= 16; length++) {
      code = (code << 1) | readBit();
      if (code <= table.maxCode[length]) {
        return table.values[table.valPtr[length] + code - table.minCode[length]];
      }
    }
    return unsupported('corrupt Huffman code');
  };

  const coef = new Int32Array(64);
  let restartsLeft = restartInterval;
  for (let my = 0; my < mcusY; my++) {
    for (let mx = 0; mx < mcusX; mx++) {
      if (restartInterval && restartsLeft === 0) {
        bitCount = 0;
        while (pos < bytes.length && !(bytes[pos] === 0xff && bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7)) pos++;
        pos += 2;
        for (const c of components) c.pred = 0;
        restartsLeft = restartInterval;
      }
      restartsLeft--;

      for (const c of components) {
        for (let by = 0; by < c.v; by++) {
          for (let bx = 0; bx < c.h; bx++) {
            coef.fill(0);
            const size = decodeSymbol(c.dc);
            c.pred += size ? receive(size) : 0;
            coef[0] = c.pred;
            for (let k = 1; k < 64; ) {
              const symbol = decodeSymbol(c.ac);
              const run = symbol >> 4;
              const bits = symbol & 15;
              if (bits === 0) {
                if (run !== 15) break;
                k += 16;
                continue;
              }
              k += run;
              if (k > 63) break;
              coef[ZIGZAG[k++]] = receive(bits);
            }
            const offset = (my * c.v + by) * 8 * c.stride + (mx * c.h + bx) * 8;
            idctFast(coef, c.quant, c.plane, offset, c.stride);
          }
        }
      }
    }
  }

  const data = new Uint8ClampedArray(width * height * 4);
  const luma = components[0];
  if (grey) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = luma.plane[y * luma.stride + x];
        const o = (y * width + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = value;
        data[o + 3] = 255;
      }
    }
    return { width, height, data };
  }

  const chroma = components.slice(1).map((c) => {
    if (maxH === 2 && maxV === 2) return { plane: upsampleH2V2(c, width, height), stride: width };
    if (maxH === 2) return { plane: upsampleH2V1(c, width), stride: width };
    return { plane: c.plane, stride: c.stride };
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const yy = luma.plane[y * luma.stride + x];
      const cb = chroma[0].plane[y * chroma[0].stride + x];
      const cr = chroma[1].plane[y * chroma[1].stride + x];
      const o = (y * width + x) * 4;
      data[o] = yy + CR_R[cr];
      data[o + 1] = yy + ((CB_G[cb] + CR_G[cr]) >> 16);
      data[o + 2] = yy + CB_B[cb];
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}
