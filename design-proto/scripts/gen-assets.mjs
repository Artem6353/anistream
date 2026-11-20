/* Генератор mock-ассетов для прототипа B1-A.
   Абстрактная «ключевая графика»: без текста и без чужих постеров — только
   собственные градиенты/формы, чтобы макет не выглядел как чужие обложки и
   не тянул внешние CDN. Запуск: node scripts/gen-assets.mjs (нужен sharp из
   корневого node_modules основного проекта). */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'public', 'design');

const palettes = [
  { a: '#1B1A3A', b: '#6E56F5', c: '#F0A98C', d: '#0B0B18' }, // indigo / peach
  { a: '#0C2230', b: '#2BB3A3', c: '#F2D06B', d: '#06141C' }, // teal / brass
  { a: '#2A1020', b: '#B23A5B', c: '#F2BFA0', d: '#140810' }, // plum / rose
  { a: '#141A16', b: '#7E9C6B', c: '#E8DCB8', d: '#080C09' }, // olive / bone
  { a: '#101827', b: '#5A7BD8', c: '#C9D6F2', d: '#070B14' }, // slate / ice
  { a: '#271306', b: '#C9762C', c: '#F2DBA8', d: '#120802' }, // amber / cream
  { a: '#1A1226', b: '#8E5BD0', c: '#E0B8F2', d: '#0B0712' }, // violet
  { a: '#08201E', b: '#2F8F71', c: '#E9F2C9', d: '#04100F' }, // green / lime
  { a: '#241016', b: '#C2453F', c: '#F2C6A8', d: '#120609' }, // crimson
  { a: '#0E1B26', b: '#3E8FB8', c: '#F2EAD9', d: '#050C12' }, // ocean
  { a: '#1D1A12', b: '#A98B4B', c: '#EFE3C4', d: '#0D0B07' }, // sepia
  { a: '#151320', b: '#6D6A96', c: '#D8D2F0', d: '#080711' }, // graphite / lilac
];

const grain = (w, h, opacity = 0.08) => `
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" result="n"/>
    <feColorMatrix type="saturate" values="0" in="n" result="m"/>
    <feComponentTransfer in="m" result="t">
      <feFuncA type="linear" slope="${opacity}"/>
    </feComponentTransfer>
  </filter>`;

function posterSvg(p, i, w = 600, h = 900) {
  const cx = 0.28 + ((i * 0.13) % 0.46);
  const cy = 0.22 + ((i * 0.17) % 0.32);
  const r = 0.2 + ((i * 0.07) % 0.14);
  const sunX = cx * w;
  const sunY = cy * h;
  const sunR = r * w;
  const arcCount = 2 + (i % 3);
  const arcs = Array.from({ length: arcCount }, (_, k) => {
    const rr = sunR * (1.5 + k * 0.55);
    return `<circle cx="${sunX}" cy="${sunY}" r="${rr}" fill="none" stroke="${p.c}" stroke-opacity="${0.16 - k * 0.03}" stroke-width="${1.5 + k}" />`;
  }).join('');
  const horizon = h * (0.62 + ((i * 0.05) % 0.2));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      ${grain(w, h)}
      <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0" stop-color="${p.a}"/>
        <stop offset="1" stop-color="${p.d}"/>
      </linearGradient>
      <radialGradient id="glow" cx="${cx}" cy="${cy}" r="${r * 2.2}">
        <stop offset="0" stop-color="${p.b}" stop-opacity="0.92"/>
        <stop offset="0.55" stop-color="${p.b}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${p.b}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" stop-color="${p.d}" stop-opacity="0"/>
        <stop offset="1" stop-color="${p.d}" stop-opacity="0.82"/>
      </linearGradient>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="${w * 0.012}"/>
      </filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    ${arcs}
    <circle cx="${sunX}" cy="${sunY}" r="${sunR * 0.42}" fill="${p.c}" opacity="0.9" filter="url(#soft)"/>
    <path d="M0 ${horizon} C ${w * 0.26} ${horizon - h * 0.08}, ${w * 0.62} ${horizon + h * 0.09}, ${w} ${horizon - h * 0.03} L ${w} ${h} L 0 ${h} Z" fill="${p.d}" opacity="0.5"/>
    <g opacity="0.5">
      <rect x="${w * 0.09}" y="${h * 0.78}" width="${w * 0.24}" height="2" fill="${p.c}"/>
      <rect x="${w * 0.09}" y="${h * 0.81}" width="${w * 0.14}" height="1" fill="${p.c}" opacity="0.6"/>
    </g>
    <rect width="${w}" height="${h}" fill="url(#scrim)"/>
    <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.5" fill="transparent"/>
  </svg>`;
}

function backdropSvg(p, i, w = 1600, h = 900) {
  const sunX = w * (0.2 + ((i * 0.21) % 0.5));
  const sunY = h * (0.3 + ((i * 0.11) % 0.25));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      ${grain(w, h, 0.07)}
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p.a}"/>
        <stop offset="0.6" stop-color="${p.b}" stop-opacity="0.55"/>
        <stop offset="1" stop-color="${p.d}"/>
      </linearGradient>
      <radialGradient id="glow" cx="${sunX / w}" cy="${sunY / h}" r="0.62">
        <stop offset="0" stop-color="${p.c}" stop-opacity="0.5"/>
        <stop offset="1" stop-color="${p.c}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${p.d}" stop-opacity="0.86"/>
        <stop offset="0.65" stop-color="${p.d}" stop-opacity="0.12"/>
        <stop offset="1" stop-color="${p.d}" stop-opacity="0.55"/>
      </linearGradient>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#glow)"/>
    <circle cx="${sunX}" cy="${sunY}" r="${h * 0.19}" fill="${p.c}" opacity="0.55" filter="url(#soft)"/>
    <path d="M0 ${h * 0.74} C ${w * 0.3} ${h * 0.6}, ${w * 0.55} ${h * 0.9}, ${w} ${h * 0.7} L ${w} ${h} L 0 ${h} Z" fill="${p.d}" opacity="0.72"/>
    <rect width="${w}" height="${h}" fill="url(#scrim)"/>
    <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.5" fill="transparent"/>
  </svg>`;
}

/* Страница комикса: кремовая бумага, рамки панелей, баллоны. Схема панелей
   меняется по индексу страницы — так четыре «страницы» не выглядят клоном. */
function comicPageSvg(i, w = 720, h = 1080) {
  const p = palettes[(i + 3) % palettes.length];
  const paper = '#F6F2E9';
  const ink = '#17161A';
  const edge = 34;
  const gap = 16;
  const layouts = [
    [{ x: 0, y: 0, w: 1, h: 0.3 }, { x: 0, y: 0.3, w: 0.52, h: 0.34 }, { x: 0.52, y: 0.3, w: 0.48, h: 0.34 }, { x: 0, y: 0.64, w: 1, h: 0.36 }],
    [{ x: 0, y: 0, w: 0.46, h: 0.42 }, { x: 0.46, y: 0, w: 0.54, h: 0.42 }, { x: 0, y: 0.42, w: 1, h: 0.26 }, { x: 0, y: 0.68, w: 0.58, h: 0.32 }, { x: 0.58, y: 0.68, w: 0.42, h: 0.32 }],
    [{ x: 0, y: 0, w: 1, h: 0.24 }, { x: 0, y: 0.24, w: 0.48, h: 0.4 }, { x: 0.48, y: 0.24, w: 0.52, h: 0.4 }, { x: 0, y: 0.64, w: 1, h: 0.36 }],
    [{ x: 0, y: 0, w: 0.56, h: 0.34 }, { x: 0.56, y: 0, w: 0.44, h: 0.34 }, { x: 0, y: 0.34, w: 1, h: 0.3 }, { x: 0, y: 0.64, w: 1, h: 0.36 }],
  ];
  const layout = layouts[i % layouts.length];
  const innerW = w - edge * 2;
  const innerH = h - edge * 2;
  const panels = layout
    .map((r, k) => {
      const x = edge + r.x * innerW + (r.x > 0 ? gap / 2 : 0);
      const y = edge + r.y * innerH + (r.y > 0 ? gap / 2 : 0);
      const pw = r.w * innerW - (r.w < 1 ? gap / 2 : 0) - (r.x > 0 ? gap / 2 : 0);
      const ph = r.h * innerH - (r.h < 1 ? gap / 2 : 0) - (r.y > 0 ? gap / 2 : 0);
      const tone = palettes[(i + k) % palettes.length];
      const bubble = k % 3 === 1;
      return `<g>
        <clipPath id="cp${k}"><rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${k % 2 ? 4 : 0}"/></clipPath>
        <g clip-path="url(#cp${k})">
          <rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="${tone.a}"/>
          <circle cx="${x + pw * (0.25 + (k % 3) * 0.2)}" cy="${y + ph * 0.45}" r="${Math.min(pw, ph) * 0.34}" fill="${tone.b}" opacity="0.55"/>
          <path d="M${x} ${y + ph * 0.78} Q ${x + pw * 0.5} ${y + ph * 0.6}, ${x + pw} ${y + ph * 0.86} L ${x + pw} ${y + ph} L ${x} ${y + ph} Z" fill="${tone.d}" opacity="0.8"/>
          <rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="url(#grain)" filter="url(#grainf)" opacity="0.5"/>
        </g>
        <rect x="${x}" y="${y}" width="${pw}" height="${ph}" fill="none" stroke="${ink}" stroke-width="2.5"/>
        ${bubble ? `<g><ellipse cx="${x + pw * 0.5}" cy="${y + ph * 0.3}" rx="${Math.min(pw * 0.32, 108)}" ry="30" fill="${paper}" stroke="${ink}" stroke-width="2"/><path d="M${x + pw * 0.42} ${y + ph * 0.3 + 26} l 14 22 l 6 -24 z" fill="${paper}" stroke="${ink}" stroke-width="2"/></g>` : ''}
      </g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <filter id="grainf"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" result="n"/><feColorMatrix type="saturate" values="0" in="n"/></filter>
      <pattern id="grain" width="1" height="1"><rect width="1" height="1" fill="#fff" opacity="0.08"/></pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="${paper}"/>
    ${panels}
    <text x="${w - edge}" y="${h - 10}" text-anchor="end" font-family="Georgia, serif" font-size="13" fill="${ink}" opacity="0.55">${i + 1}</text>
  </svg>`;
}

function avatarSvg(letter, p, size = 256) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${p.b}"/><stop offset="1" stop-color="${p.d}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <circle cx="${size * 0.72}" cy="${size * 0.28}" r="${size * 0.3}" fill="${p.c}" opacity="0.35"/>
    <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-size="${size * 0.44}" fill="#fff" opacity="0.92">${letter}</text>
  </svg>`;
}

async function writeJpg(dir, name, svg, width) {
  const file = path.join(out, dir, name);
  await sharp(Buffer.from(svg)).resize({ width }).jpeg({ quality: 86, mozjpeg: true }).toFile(file);
  return file;
}

await mkdir(path.join(out, 'posters'), { recursive: true });
await mkdir(path.join(out, 'backdrops'), { recursive: true });
await mkdir(path.join(out, 'comics'), { recursive: true });
await mkdir(path.join(out, 'pages'), { recursive: true });
await mkdir(path.join(out, 'avatars'), { recursive: true });

let count = 0;
for (let i = 0; i < 12; i++) {
  const p = palettes[i % palettes.length];
  await writeJpg('posters', `${String(i + 1).padStart(2, '0')}.jpg`, posterSvg(p, i), 600);
  count++;
}
for (let i = 0; i < 6; i++) {
  const p = palettes[(i + 5) % palettes.length];
  await writeJpg('comics', `${String(i + 1).padStart(2, '0')}.jpg`, posterSvg(p, i + 2, 640, 960), 640);
  count++;
}
for (let i = 0; i < 4; i++) {
  const p = palettes[(i + 1) % palettes.length];
  await writeJpg('backdrops', `${String(i + 1).padStart(2, '0')}.jpg`, backdropSvg(p, i), 1600);
  count++;
}
for (let i = 0; i < 4; i++) {
  await writeJpg('pages', `${String(i + 1).padStart(2, '0')}.jpg`, comicPageSvg(i), 720);
  count++;
}
const avatarLetters = ['А', 'N', 'К'];
for (let i = 0; i < 3; i++) {
  const p = palettes[(i + 6) % palettes.length];
  await writeJpg('avatars', `${String(i + 1).padStart(2, '0')}.jpg`, avatarSvg(avatarLetters[i], p), 256);
  count++;
}

await writeFile(path.join(out, 'README.txt'), 'Mock-ассеты B1-A. Сгенерированы scripts/gen-assets.mjs; не являются постерами реальных тайтлов.\n', 'utf8');
console.log(`assets written: ${count}`);
