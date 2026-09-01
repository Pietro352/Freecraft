// Minimal PNG decoder/encoder (8-bit, non-interlaced) used by the logo patcher.
// Only what we need: read palette/greyscale/RGB/RGBA images, write RGBA.
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunks(buf) {
  const out = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    out.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a PNG into { width, height, data: RGBA Uint8Array }. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const cs = chunks(buf);
  const ihdr = cs.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8) throw new Error('unsupported bit depth ' + depth);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');

  const plte = cs.find((c) => c.type === 'PLTE');
  const trns = cs.find((c) => c.type === 'tRNS');
  const raw = zlib.inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));

  const bpp = CHANNELS[colorType];
  if (!bpp) throw new Error('unsupported color type ' + colorType);
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * bpp;
    const d = i * 4;
    if (colorType === 6) {
      data[d] = pixels[s]; data[d + 1] = pixels[s + 1]; data[d + 2] = pixels[s + 2]; data[d + 3] = pixels[s + 3];
    } else if (colorType === 2) {
      data[d] = pixels[s]; data[d + 1] = pixels[s + 1]; data[d + 2] = pixels[s + 2]; data[d + 3] = 255;
    } else if (colorType === 0) {
      data[d] = data[d + 1] = data[d + 2] = pixels[s]; data[d + 3] = 255;
    } else if (colorType === 4) {
      data[d] = data[d + 1] = data[d + 2] = pixels[s]; data[d + 3] = pixels[s + 1];
    } else {
      const idx = pixels[s];
      data[d] = plte.data[idx * 3];
      data[d + 1] = plte.data[idx * 3 + 1];
      data[d + 2] = plte.data[idx * 3 + 2];
      data[d + 3] = trns && idx < trns.data.length ? trns.data[idx] : 255;
    }
  }
  return { width, height, data };
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

/** Encode an RGBA image as an 8-bit non-interlaced PNG. */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Box-filter resize with premultiplied alpha, so edges stay clean. */
export function resize(img, dw, dh) {
  const { width: sw, height: sh, data: src } = img;
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = (y * sh) / dh;
    const y1 = ((y + 1) * sh) / dh;
    for (let x = 0; x < dw; x++) {
      const x0 = (x * sw) / dw;
      const x1 = ((x + 1) * sw) / dw;
      let r = 0, g = 0, b = 0, a = 0, w = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const i = (sy * sw + sx) * 4;
          const alpha = src[i + 3] / 255;
          const weight = wx * wy;
          r += src[i] * alpha * weight;
          g += src[i + 1] * alpha * weight;
          b += src[i + 2] * alpha * weight;
          a += alpha * weight;
          w += weight;
        }
      }
      const d = (y * dw + x) * 4;
      if (a > 0) {
        out[d] = Math.round(r / a);
        out[d + 1] = Math.round(g / a);
        out[d + 2] = Math.round(b / a);
        out[d + 3] = Math.round((a / w) * 255);
      }
    }
  }
  return { width: dw, height: dh, data: out };
}
