import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePng(width, height, getPixel) {
  const bytesPerLine = width * 4 + 1;
  const rawData = Buffer.alloc(bytesPerLine * height);
  for (let y = 0; y < height; y++) {
    const lineOffset = y * bytesPerLine;
    rawData[lineOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      const pxOffset = lineOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }
  const compressed = zlib.deflateSync(rawData);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Distance to rounded rectangle
function sdRoundBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0.0) + Math.hypot(Math.max(qx, 0.0), Math.max(qy, 0.0)) - r;
}

// Distance to rounded vertical capsule
function sdCapsule(px, py, x, y1, y2, r) {
  const clampY = Math.max(y1, Math.min(y2, py));
  return Math.hypot(px - x, py - clampY) - r;
}

// Distance to circle
function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function renderPwaIconPixel(x, y, size, isMaskable = false) {
  const normX = x / size;
  const normY = y / size;

  // Background Slate gradient: #1e293b to #0f172a
  const bgR = Math.round(30 - normY * 15);
  const bgG = Math.round(41 - normY * 18);
  const bgB = Math.round(59 - normY * 17);

  // Badge parameters
  const badgeScale = isMaskable ? 0.70 : 0.78;
  const badgeHalf = (size * badgeScale) / 2;
  const badgeRadius = badgeHalf * 0.45;
  const centerX = size / 2;
  const centerY = size / 2;

  const dBadge = sdRoundBox(x - centerX, y - centerY, badgeHalf, badgeHalf, badgeRadius);

  if (dBadge > 1.5 && !isMaskable) {
    // Outer rounded rect for non-maskable icons
    const outerHalf = size / 2;
    const outerRadius = size * 0.22;
    const dOuter = sdRoundBox(x - centerX, y - centerY, outerHalf, outerHalf, outerRadius);
    if (dOuter > 0) return [0, 0, 0, 0];
    const alpha = Math.max(0, Math.min(1, -dOuter + 0.5));
    return [bgR, bgG, bgB, Math.round(alpha * 255)];
  }

  if (isMaskable && dBadge > 1.0) {
    return [bgR, bgG, bgB, 255];
  }

  // Inside badge: Blue gradient #3b82f6 -> #1d4ed8
  const badgeGrad = (normX + normY) / 2;
  let r = Math.round(59 - badgeGrad * 30);
  let g = Math.round(130 - badgeGrad * 52);
  let b = Math.round(246 - badgeGrad * 30);

  // Waveform coordinates mapped to 24x24 grid in center
  // transform: translate(4, 4), d="M4 11V13M8 7V17M12 3V21M16 6V18M20 10V14"
  // circles at (12, 3) r=2 and (16, 18) r=2
  const wfScale = (badgeHalf * 1.35) / 24;
  const wfLeft = centerX - 12 * wfScale;
  const wfTop = centerY - 12 * wfScale;

  const wfX = (x - wfLeft) / wfScale;
  const wfY = (y - wfTop) / wfScale;

  const rBar = 1.25; // stroke-width 2.5 => radius 1.25
  const bars = [
    sdCapsule(wfX, wfY, 4, 11, 13, rBar),
    sdCapsule(wfX, wfY, 8, 7, 17, rBar),
    sdCapsule(wfX, wfY, 12, 3, 21, rBar),
    sdCapsule(wfX, wfY, 16, 6, 18, rBar),
    sdCapsule(wfX, wfY, 20, 10, 14, rBar),
    sdCircle(wfX, wfY, 12, 3, 2.0),
    sdCircle(wfX, wfY, 16, 18, 2.0),
  ];

  let minWaveDist = Math.min(...bars);
  const waveDistPx = minWaveDist * wfScale;

  if (waveDistPx <= 1.0) {
    const whiteAlpha = Math.max(0, Math.min(1, 0.5 - waveDistPx));
    r = Math.round(r * (1 - whiteAlpha) + 255 * whiteAlpha);
    g = Math.round(g * (1 - whiteAlpha) + 255 * whiteAlpha);
    b = Math.round(b * (1 - whiteAlpha) + 255 * whiteAlpha);
  }

  if (dBadge <= 0) {
    return [r, g, b, 255];
  } else {
    // Anti-alias edge between badge and background
    const edgeAlpha = Math.max(0, Math.min(1, 1.0 - dBadge));
    return [
      Math.round(r * edgeAlpha + bgR * (1 - edgeAlpha)),
      Math.round(g * edgeAlpha + bgG * (1 - edgeAlpha)),
      Math.round(b * edgeAlpha + bgB * (1 - edgeAlpha)),
      255
    ];
  }
}

const publicDir = path.resolve('public');

console.log('Generating PWA icons...');

// 1. Scalable SVG
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
  <defs>
    <linearGradient id="pwa-bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="pwa-badge" x1="64" y1="64" x2="448" y2="448" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#pwa-bg)"/>
  <rect x="56" y="56" width="400" height="400" rx="88" fill="url(#pwa-badge)"/>
  <g transform="translate(104, 104) scale(12.67)" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 11V13M8 7V17M12 3V21M16 6V18M20 10V14" />
    <circle cx="12" cy="3" r="2" fill="white" stroke="none" />
    <circle cx="16" cy="18" r="2" fill="white" stroke="none" />
  </g>
</svg>
`;
fs.writeFileSync(path.join(publicDir, 'pwa-icon.svg'), svgContent, 'utf-8');

// 2. 192x192 PNG
const png192 = makePng(192, 192, (x, y, w, h) => renderPwaIconPixel(x, y, w, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), png192);

// 3. 512x512 PNG
const png512 = makePng(512, 512, (x, y, w, h) => renderPwaIconPixel(x, y, w, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), png512);

// 4. 512x512 Maskable PNG
const pngMaskable = makePng(512, 512, (x, y, w, h) => renderPwaIconPixel(x, y, w, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pngMaskable);

// 5. Apple Touch Icon (180x180)
const pngApple = makePng(180, 180, (x, y, w, h) => renderPwaIconPixel(x, y, w, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), pngApple);

console.log('All PWA icons generated successfully in public/');
