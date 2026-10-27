// Gera os ícones PNG do app (fundo roxo + gráfico de rosca branco) sem dependências.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x6a, 0x1b, 0x9a];
const FG = [0xff, 0xff, 0xff];
const FG2 = [0xd9, 0xb8, 0xee];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Cor do ponto (x, y) em coordenadas 0..1. */
function shade(x, y) {
  const dx = x - 0.5, dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  if (r > 0.2 && r < 0.32) {
    // Ângulo a partir do topo, sentido horário.
    const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI);
    const gap = 0.12;
    if (a > gap / 2 && a < 4.1 - gap / 2) return FG;
    if (a > 4.1 + gap / 2 && a < 2 * Math.PI - gap / 2) return FG2;
  }
  return BG;
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (ss * ss));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [180, 192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size));
console.log('ícones gerados em public/icons');
