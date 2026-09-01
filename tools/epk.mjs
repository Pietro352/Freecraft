// Reader/writer for the EaglercraftX "EAGPKG$$ ver2.0" resource package that the
// FREECRAFT client keeps embedded (base64) inside its bundled classes.js.
//
// Layout: header | 'G' | gzip(body) | ":::YEE:>"
// body:   "HEAD" u8len "file-type" i32len "epk/resources" '>'
//         ("FILE" u8len <name> i32len <crc32:4><content>':' '>')*
//         "END$"
import zlib from 'node:zlib';

const EOF_CODE = ':::YEE:>';

export function readEpk(buf) {
  if (buf.toString('latin1', 0, 8) !== 'EAGPKG$$') throw new Error('not an EPK');
  let p = 8;
  const readStr8 = () => { const n = buf[p++]; const s = buf.toString('latin1', p, p + n); p += n; return s; };
  const version = readStr8();
  if (!version.startsWith('ver2.')) throw new Error('unsupported EPK version ' + version);
  readStr8();                       // package file name
  p += 2 + buf.readUInt16BE(p);     // comment
  p += 8;                           // timestamp
  p += 4;                           // file count
  const compression = String.fromCharCode(buf[p++]);
  if (compression !== 'G') throw new Error('unsupported EPK compression ' + compression);
  const header = buf.subarray(0, p);

  // Node refuses a gzip member followed by the ":::YEE:>" trailer, so inflate raw.
  const body = zlib.inflateRawSync(buf.subarray(p + 10), { maxOutputLength: 1 << 30 });

  const entries = [];
  let q = 0;
  for (;;) {
    const type = body.toString('latin1', q, q + 4);
    if (type === 'END$') break;
    q += 4;
    const n = body[q++];
    const name = body.toString('latin1', q, q + n);
    q += n;
    const len = body.readInt32BE(q);
    q += 4;
    const block = body.subarray(q, q + len);
    q += len;
    if (body[q++] !== 0x3e) throw new Error('missing entry terminator after ' + name);
    const content = type === 'FILE' ? block.subarray(4, len - 1) : block;
    if (type === 'FILE' && (zlib.crc32(content) >>> 0) !== block.readUInt32BE(0)) {
      throw new Error('bad checksum for ' + name);
    }
    entries.push({ type, name, content });
  }
  return { header, entries };
}

export function writeEpk({ header, entries }) {
  const parts = [];
  for (const { type, name, content } of entries) {
    const head = Buffer.alloc(5 + name.length + 4);
    head.write(type, 0, 'latin1');
    head[4] = name.length;
    head.write(name, 5, 'latin1');
    if (type === 'FILE') {
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(zlib.crc32(content) >>> 0, 0);
      head.writeInt32BE(content.length + 5, 5 + name.length);
      parts.push(head, crc, content, Buffer.from([0x3a, 0x3e]));
    } else {
      head.writeInt32BE(content.length, 5 + name.length);
      parts.push(head, content, Buffer.from([0x3e]));
    }
  }
  parts.push(Buffer.from('END$', 'latin1'));
  const body = Buffer.concat(parts);

  // The entry count sits just before the compression marker that ends the
  // header; it goes stale as soon as a file is added or removed.
  const stamped = Buffer.from(header);
  stamped.writeInt32BE(entries.length, stamped.length - 5);

  return Buffer.concat([stamped, zlib.gzipSync(body, { level: 9 }), Buffer.from(EOF_CODE, 'latin1')]);
}
