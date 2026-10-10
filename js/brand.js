// OKKIE — logo en app-icoon als SVG. Ook gebruikt door tools/make-icons.mjs.
// OKKIE komt van "oche" (uitgesproken als okkie): de werplijn waar een darter achter staat.

export const TAGLINE = 'Gooi. Scoor. Word beter.';

function boardRings(cx, cy, r) {
  const seg = [];
  const pol = (rad, deg) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
  const arc = (r1, r2, a1, a2, fill) => {
    const [x1, y1] = pol(r2, a1), [x2, y2] = pol(r2, a2), [x3, y3] = pol(r1, a2), [x4, y4] = pol(r1, a1);
    const f = n => n.toFixed(2);
    seg.push(`<path d="M${f(x1)} ${f(y1)}A${r2} ${r2} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r1} ${r1} 0 0 0 ${f(x4)} ${f(y4)}Z" fill="${fill}"/>`);
  };
  for (let i = 0; i < 20; i++) {
    const a1 = -90 + i * 18 - 9, a2 = a1 + 18, even = i % 2 === 0;
    arc(r * 0.1, r * 0.58, a1, a2, even ? '#101a14' : '#efe6cf');
    arc(r * 0.58, r * 0.66, a1, a2, even ? '#e8363b' : '#1fae5b');
    arc(r * 0.66, r * 0.9, a1, a2, even ? '#101a14' : '#efe6cf');
    arc(r * 0.9, r, a1, a2, even ? '#e8363b' : '#1fae5b');
  }
  seg.push(`<circle cx="${cx}" cy="${cy}" r="${r * 0.1}" fill="#1fae5b"/><circle cx="${cx}" cy="${cy}" r="${r * 0.045}" fill="#e8363b"/>`);
  return seg.join('');
}

// Een pijl die schuin in de bull steekt (punt op cx,cy).
function dartShape(cx, cy, s) {
  return `<g transform="translate(${cx} ${cy}) rotate(-40) scale(${s})">
    <path d="M0 0 L-3 -16 L3 -16 Z" fill="#d9dee2"/>
    <rect x="-5.5" y="-52" width="11" height="37" rx="3" fill="url(#barrel)"/>
    <g fill="#0b0f0d" opacity=".35"><rect x="-5.5" y="-45" width="11" height="2.4"/><rect x="-5.5" y="-39" width="11" height="2.4"/><rect x="-5.5" y="-33" width="11" height="2.4"/><rect x="-5.5" y="-27" width="11" height="2.4"/></g>
    <rect x="-2" y="-78" width="4" height="27" rx="1.5" fill="#2b2f33"/>
    <path d="M0 -66 L-15 -92 L-13 -112 L0 -100 Z" fill="#b8ff3c"/>
    <path d="M0 -66 L15 -92 L13 -112 L0 -100 Z" fill="#7fd319"/>
    <path d="M0 -68 L0 -101" stroke="#4d8a0c" stroke-width="2"/>
  </g>`;
}

const DEFS = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f3b27"/><stop offset="1" stop-color="#05140d"/></linearGradient>
  <linearGradient id="barrel" x1="0" x2="1"><stop offset="0" stop-color="#8b949b"/><stop offset=".45" stop-color="#f4f6f7"/><stop offset="1" stop-color="#6b747b"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#b8ff3c" stop-opacity=".0"/><stop offset=".85" stop-color="#b8ff3c" stop-opacity=".18"/><stop offset="1" stop-color="#b8ff3c" stop-opacity="0"/></radialGradient>
</defs>`;

// App-icoon (vierkant). maskable: extra veilige marge voor Android-maskers.
export function iconSVG({ size = 512, maskable = false, rounded = true } = {}) {
  const r = maskable ? 150 : 178;
  const rx = rounded && !maskable ? 112 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${DEFS}
  <rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
  <circle cx="256" cy="262" r="${r * 1.22}" fill="url(#glow)"/>
  <circle cx="256" cy="262" r="${r * 1.07}" fill="#0a0f0c"/>
  ${boardRings(256, 262, r)}
  ${dartShape(256, 262, maskable ? 1.6 : 1.95)}
</svg>`;
}

// Logo: dartbord als "O" + woordmerk "KKIE".
export function logoSVG({ height = 40, mono = false } = {}) {
  const text = mono ? 'currentColor' : 'var(--logo-text, #f3eedf)';
  return `<svg class="logo" height="${height}" viewBox="0 0 378 100" role="img" aria-label="OKKIE.">${DEFS}
  <g>
    <circle cx="50" cy="50" r="47" fill="#0a0f0c"/>
    ${boardRings(50, 50, 43)}
    ${dartShape(50, 50, 0.46)}
  </g>
  <text x="104" y="78" fill="${text}" font-family="'Arial Black','Segoe UI Black',system-ui,sans-serif" font-weight="900" font-style="italic" font-size="74" textLength="246" lengthAdjust="spacingAndGlyphs">KKIE</text>
  <circle cx="364" cy="70" r="8.5" fill="#b8ff3c"/>
</svg>`;
}
