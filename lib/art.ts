import { hashStr } from './format';

/**
 * Генеративная обложка-фолбэк: работает офлайн и когда CDN постеров недоступен.
 * Детерминирована по слагу тайтла — карточка всегда выглядит одинаково.
 */
export function artUri(seed: string, initials: string, wide = false): string {
  const h = hashStr(seed);
  const hue = h % 360;
  const hue2 = (hue + 40 + (h >> 3) % 80) % 360;
  const w = wide ? 1280 : 600;
  const hh = wide ? 720 : 900;
  const cx = 20 + (h >> 5) % 60;
  const cy = 15 + (h >> 7) % 50;
  const letter = (initials || '?').replace(/[<>&"]/g, '').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 65% 16%)"/>
<stop offset=".55" stop-color="hsl(${hue2} 60% 10%)"/>
<stop offset="1" stop-color="hsl(${(hue + 200) % 360} 55% 7%)"/>
</linearGradient>
<radialGradient id="r" cx="${cx}%" cy="${cy}%" r="75%">
<stop offset="0" stop-color="hsl(${hue} 90% 62% / .55)"/>
<stop offset=".6" stop-color="hsl(${hue2} 85% 45% / .12)"/>
<stop offset="1" stop-color="transparent"/>
</radialGradient>
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".05"/></feComponentTransfer></filter>
</defs>
<rect width="${w}" height="${hh}" fill="url(#g)"/>
<rect width="${w}" height="${hh}" fill="url(#r)"/>
<g stroke="hsl(${hue} 80% 75% / .16)" fill="none" stroke-width="1.5">
<circle cx="${w * 0.78}" cy="${hh * 0.24}" r="${hh * 0.34}"/>
<circle cx="${w * 0.78}" cy="${hh * 0.24}" r="${hh * 0.22}"/>
<circle cx="${w * 0.78}" cy="${hh * 0.24}" r="${hh * 0.11}"/>
</g>
<text x="6%" y="${hh * (wide ? 0.72 : 0.82)}" font-family="system-ui,Segoe UI,sans-serif" font-weight="800" font-size="${hh * (wide ? 0.34 : 0.3)}" fill="hsl(${hue} 90% 82% / .22)" letter-spacing="-0.04em">${letter}</text>
<rect width="${w}" height="${hh}" filter="url(#n)"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
