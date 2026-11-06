// Generates original, simple placeholder illustrations for every menu item
// as local SVG files in public/images/menu. Run with:
//   node scripts/generate-menu-images.mjs
// No brand assets or photos are used.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "images", "menu");
mkdirSync(OUT, { recursive: true });

const W = 400;
const H = 300;
const CX = 200;
const CY = 150;

// Small deterministic random number generator so output is stable.
function rng(seed) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function scatter(rand, n, radius, minGap = 22) {
  const pts = [];
  let tries = 0;
  while (pts.length < n && tries < 2000) {
    tries++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const p = { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r, rot: rand() * 360 };
    if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > minGap)) pts.push(p);
  }
  return pts;
}

const svg = (bg, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">` +
  `<rect width="${W}" height="${H}" fill="${bg}"/>` +
  `<circle cx="60" cy="40" r="90" fill="#ffffff" opacity="0.25"/>` +
  `<circle cx="360" cy="280" r="110" fill="#ffffff" opacity="0.18"/>` +
  body +
  `</svg>`;

// ---------- Pizza toppings ----------
const T = {
  pepperoni: (p) =>
    `<g transform="translate(${p.x} ${p.y})"><circle r="13" fill="#b3261e"/><circle r="13" fill="none" stroke="#8c1b15" stroke-width="2"/><circle cx="-4" cy="-3" r="2" fill="#8c1b15"/><circle cx="4" cy="4" r="1.6" fill="#8c1b15"/></g>`,
  chicken: (p) =>
    `<rect x="${p.x - 9}" y="${p.y - 6}" width="18" height="12" rx="5" fill="#e8c393" stroke="#c99b62" stroke-width="1.5" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  pineapple: (p) =>
    `<path d="M${p.x - 7} ${p.y + 6} L${p.x} ${p.y - 8} L${p.x + 7} ${p.y + 6} Z" fill="#f6d64a" stroke="#d9b21f" stroke-width="1.5" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  basil: (p) =>
    `<ellipse cx="${p.x}" cy="${p.y}" rx="10" ry="5" fill="#3e8e41" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  olive: (p) => `<circle cx="${p.x}" cy="${p.y}" r="6" fill="none" stroke="#2b2b2b" stroke-width="4"/>`,
  capsicum: (p) =>
    `<path d="M${p.x - 10} ${p.y} q10 -12 20 0" fill="none" stroke="#3f9b46" stroke-width="5" stroke-linecap="round" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  mushroom: (p) =>
    `<g transform="rotate(${p.rot} ${p.x} ${p.y})"><path d="M${p.x - 10} ${p.y} a10 9 0 0 1 20 0 Z" fill="#cfae8a"/><rect x="${p.x - 3}" y="${p.y}" width="6" height="8" rx="2" fill="#e6d3bb"/></g>`,
  onion: (p) =>
    `<path d="M${p.x - 9} ${p.y + 3} q9 -14 18 0" fill="none" stroke="#a24c8c" stroke-width="3" stroke-linecap="round" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  corn: (p) => `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#f7cf3c" stroke="#d9a915" stroke-width="1"/>`,
  chili: (p) =>
    `<path d="M${p.x - 8} ${p.y} q8 -6 16 0" fill="none" stroke="#e0301e" stroke-width="4" stroke-linecap="round" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  prawn: (p) =>
    `<path d="M${p.x - 10} ${p.y} a10 10 0 1 1 10 10" fill="none" stroke="#f07c4a" stroke-width="7" stroke-linecap="round" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  squid: (p) => `<circle cx="${p.x}" cy="${p.y}" r="7" fill="none" stroke="#f4efe6" stroke-width="4"/>`,
  crab: (p) =>
    `<rect x="${p.x - 11}" y="${p.y - 4}" width="22" height="8" rx="3" fill="#f6f1ea" stroke="#e2533a" stroke-width="2.5" transform="rotate(${p.rot} ${p.x} ${p.y})"/>`,
  beef: (p) => `<circle cx="${p.x}" cy="${p.y}" r="6" fill="#6b3b2a"/>`,
  sausage: (p) =>
    `<g transform="translate(${p.x} ${p.y})"><circle r="9" fill="#d9925c"/><circle r="9" fill="none" stroke="#b06a37" stroke-width="2"/></g>`,
  tomato: (p) =>
    `<g transform="translate(${p.x} ${p.y})"><circle r="11" fill="#e2483a"/><circle r="6" fill="#f07a68"/></g>`,
};

function pizza(id, { sauce = "#d2462f", toppings }) {
  const rand = rng(id);
  let out = "";
  // board + shadow
  out += `<ellipse cx="${CX}" cy="${CY + 112}" rx="120" ry="14" fill="#000" opacity="0.08"/>`;
  out += `<circle cx="${CX}" cy="${CY}" r="128" fill="#c99863"/>`;
  out += `<circle cx="${CX}" cy="${CY}" r="128" fill="none" stroke="#a87a48" stroke-width="3"/>`;
  // crust, sauce, cheese
  out += `<circle cx="${CX}" cy="${CY}" r="112" fill="#e7ad5f"/>`;
  out += `<circle cx="${CX}" cy="${CY}" r="112" fill="none" stroke="#c98a3c" stroke-width="3"/>`;
  out += `<circle cx="${CX}" cy="${CY}" r="96" fill="${sauce}"/>`;
  for (const p of scatter(rand, 16, 78, 20)) {
    out += `<circle cx="${p.x}" cy="${p.y}" r="${16 + rand() * 10}" fill="#f8d97a" opacity="0.92"/>`;
  }
  // toppings
  for (const [name, count] of toppings) {
    for (const p of scatter(rand, count, 80, 18)) out += T[name](p);
  }
  // slice lines
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4 + 0.3;
    out += `<line x1="${CX - Math.cos(a) * 112}" y1="${CY - Math.sin(a) * 112}" x2="${CX + Math.cos(a) * 112}" y2="${CY + Math.sin(a) * 112}" stroke="#8a5a2b" stroke-width="1.5" opacity="0.35"/>`;
  }
  return svg("#f6e2c6", out);
}

const plate = (fill = "#ffffff") =>
  `<ellipse cx="${CX}" cy="${CY + 92}" rx="140" ry="16" fill="#000" opacity="0.08"/>` +
  `<ellipse cx="${CX}" cy="${CY + 18}" rx="160" ry="92" fill="${fill}" stroke="#e7d8c4" stroke-width="3"/>` +
  `<ellipse cx="${CX}" cy="${CY + 14}" rx="118" ry="64" fill="none" stroke="#efe4d6" stroke-width="2"/>`;

const bowl = (fill) =>
  `<ellipse cx="${CX}" cy="${CY + 102}" rx="110" ry="12" fill="#000" opacity="0.08"/>` +
  `<path d="M${CX - 130} ${CY} a130 100 0 0 0 260 0 Z" fill="${fill}"/>` +
  `<ellipse cx="${CX}" cy="${CY}" rx="130" ry="26" fill="#fffaf2" stroke="#e7d8c4" stroke-width="3"/>`;

const simple = {
  "garlic-bread": () => {
    let o = plate();
    for (let i = 0; i < 4; i++) {
      const x = 105 + i * 50;
      o += `<rect x="${x}" y="${100 + (i % 2) * 14}" width="58" height="100" rx="18" fill="#e3a650" stroke="#b97a2e" stroke-width="3" transform="rotate(${-12 + i * 8} ${x + 29} 150)"/>`;
      o += `<rect x="${x + 8}" y="${110 + (i % 2) * 14}" width="42" height="80" rx="12" fill="#f4cf86" transform="rotate(${-12 + i * 8} ${x + 29} 150)"/>`;
    }
    const rand = rng("gb");
    for (let i = 0; i < 40; i++) o += `<circle cx="${120 + rand() * 170}" cy="${115 + rand() * 80}" r="2" fill="#3e8e41"/>`;
    return svg("#fbe3c4", o);
  },
  "chicken-wings": () => {
    let o = plate();
    const pts = [[140, 130], [200, 115], [260, 130], [160, 180], [230, 182], [200, 150]];
    for (const [x, y] of pts) {
      o += `<g transform="rotate(${(x + y) % 50 - 25} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="34" ry="20" fill="#a8471f"/><ellipse cx="${x - 6}" cy="${y - 5}" rx="20" ry="9" fill="#cf6a2d" opacity="0.8"/></g>`;
    }
    for (let i = 0; i < 12; i++) o += `<circle cx="${130 + ((i * 37) % 150)}" cy="${115 + ((i * 23) % 80)}" r="2" fill="#f4e6c8"/>`;
    return svg("#f9d9c2", o);
  },
  "cheesy-potato-wedges": () => {
    let o = plate();
    for (let i = 0; i < 7; i++) {
      const x = 115 + i * 28;
      o += `<path d="M${x} 200 L${x + 22} 105 L${x + 40} 200 Z" fill="#e9b25a" stroke="#b9792f" stroke-width="3" transform="rotate(${-15 + i * 5} ${x + 20} 160)"/>`;
    }
    o += `<path d="M120 135 q30 -25 60 0 q30 25 60 0 q30 -25 50 5 l-5 20 q-40 10 -80 0 q-40 -10 -80 0 Z" fill="#f7c843" opacity="0.92"/>`;
    return svg("#fbe7c0", o);
  },
  "garden-salad": () => {
    let o = bowl("#8fc27c");
    const rand = rng("salad");
    for (let i = 0; i < 14; i++)
      o += `<ellipse cx="${100 + rand() * 200}" cy="${CY - 10 + rand() * 30}" rx="26" ry="14" fill="${i % 2 ? "#5aa349" : "#7cc061"}" transform="rotate(${rand() * 180} 200 150)"/>`;
    for (let i = 0; i < 5; i++) o += `<circle cx="${120 + i * 40}" cy="${CY - 6 + (i % 2) * 14}" r="11" fill="#e2483a"/>`;
    for (let i = 0; i < 4; i++) o += `<circle cx="${140 + i * 40}" cy="${CY + 10}" r="10" fill="#d9f0c8" stroke="#6aa956" stroke-width="3"/>`;
    for (let i = 0; i < 6; i++) o += `<rect x="${125 + i * 26}" y="${CY - 22}" width="16" height="6" rx="3" fill="#f08a2c"/>`;
    return svg("#e3f0d6", o);
  },
  "creamy-mushroom-penne": () => {
    let o = plate();
    o += `<ellipse cx="${CX}" cy="${CY + 10}" rx="110" ry="58" fill="#f4e4c1"/>`;
    const rand = rng("penne");
    for (let i = 0; i < 22; i++) {
      const x = 110 + rand() * 180;
      const y = 115 + rand() * 75;
      o += `<rect x="${x - 15}" y="${y - 6}" width="30" height="12" rx="3" fill="#f2c66d" stroke="#d3a043" stroke-width="2" transform="rotate(${rand() * 180} ${x} ${y})"/>`;
    }
    for (let i = 0; i < 6; i++) o += T.mushroom({ x: 130 + i * 28, y: 130 + (i % 2) * 30, rot: i * 40 });
    return svg("#f6ead2", o);
  },
  "beef-bolognese": () => {
    let o = plate();
    for (let i = 0; i < 9; i++)
      o += `<ellipse cx="${CX}" cy="${CY + 10}" rx="${100 - i * 9}" ry="${54 - i * 5}" fill="none" stroke="#f0cc78" stroke-width="5"/>`;
    o += `<ellipse cx="${CX}" cy="${CY + 2}" rx="56" ry="30" fill="#a8341f"/>`;
    for (let i = 0; i < 14; i++) o += `<circle cx="${160 + ((i * 29) % 80)}" cy="${140 + ((i * 17) % 26)}" r="5" fill="#6b2a17"/>`;
    o += `<circle cx="205" cy="140" r="5" fill="#3e8e41"/><circle cx="185" cy="152" r="4" fill="#3e8e41"/>`;
    return svg("#f7dcc6", o);
  },
  cola: () =>
    svg(
      "#f6d6d3",
      `<ellipse cx="200" cy="262" rx="62" ry="10" fill="#000" opacity="0.1"/>` +
        `<rect x="145" y="50" width="110" height="210" rx="22" fill="#c8102e"/>` +
        `<rect x="145" y="50" width="110" height="24" rx="12" fill="#c9c9c9"/>` +
        `<rect x="145" y="238" width="110" height="22" rx="11" fill="#b5b5b5"/>` +
        `<path d="M145 150 q55 -40 110 0 v30 q-55 -40 -110 0 Z" fill="#ffffff"/>` +
        `<rect x="160" y="85" width="10" height="140" rx="5" fill="#ffffff" opacity="0.25"/>` +
        `<circle cx="300" cy="90" r="9" fill="#ffffff" opacity="0.7"/><circle cx="96" cy="130" r="6" fill="#ffffff" opacity="0.7"/>`,
    ),
  "iced-lemon-tea": () =>
    svg(
      "#fbe8c6",
      `<ellipse cx="200" cy="262" rx="62" ry="10" fill="#000" opacity="0.1"/>` +
        `<path d="M140 60 L260 60 L245 258 L155 258 Z" fill="#ffffff" opacity="0.6" stroke="#e6cfa6" stroke-width="3"/>` +
        `<path d="M146 100 L254 100 L245 252 L155 252 Z" fill="#c9771d"/>` +
        `<rect x="165" y="115" width="30" height="30" rx="6" fill="#ffffff" opacity="0.55" transform="rotate(12 180 130)"/>` +
        `<rect x="205" y="150" width="28" height="28" rx="6" fill="#ffffff" opacity="0.5" transform="rotate(-10 219 164)"/>` +
        `<circle cx="252" cy="70" r="30" fill="#f6dc4b" stroke="#e1b81a" stroke-width="4"/>` +
        `<path d="M252 70 L252 42 M252 70 L276 56 M252 70 L276 84 M252 70 L252 98 M252 70 L228 84 M252 70 L228 56" stroke="#e1b81a" stroke-width="3"/>` +
        `<rect x="215" y="20" width="8" height="150" rx="4" fill="#2f6b3f" transform="rotate(14 219 95)"/>`,
    ),
  "mineral-water": () =>
    svg(
      "#dcecf2",
      `<ellipse cx="200" cy="264" rx="52" ry="9" fill="#000" opacity="0.1"/>` +
        `<rect x="178" y="28" width="44" height="26" rx="6" fill="#2a6f97"/>` +
        `<path d="M170 60 h60 q10 20 18 40 v150 q0 10 -10 10 h-76 q-10 0 -10 -10 v-150 q8 -20 18 -40 Z" fill="#bfe1f0" stroke="#7fb9d3" stroke-width="3"/>` +
        `<rect x="152" y="140" width="96" height="48" fill="#2a6f97"/>` +
        `<path d="M168 164 q16 -12 32 0 q16 12 32 0" stroke="#ffffff" stroke-width="4" fill="none"/>` +
        `<rect x="164" y="90" width="8" height="150" rx="4" fill="#ffffff" opacity="0.6"/>`,
    ),
  "chocolate-lava-cake": () => {
    let o = plate();
    o += `<path d="M135 165 q0 -80 65 -80 q65 0 65 80 Z" fill="#4a2618"/>`;
    o += `<ellipse cx="200" cy="165" rx="65" ry="14" fill="#3a1d12"/>`;
    o += `<path d="M215 160 q30 5 45 30 q-20 15 -60 10 q-10 -20 15 -40 Z" fill="#6b3420"/>`;
    o += `<path d="M150 112 q50 -30 100 0" stroke="#ffffff" stroke-width="4" fill="none" opacity="0.6" stroke-dasharray="2 8" stroke-linecap="round"/>`;
    o += `<circle cx="205" cy="80" r="9" fill="#c8102e"/><path d="M205 72 q5 -12 14 -14" stroke="#2f6b3f" stroke-width="3" fill="none"/>`;
    return svg("#efd9cb", o);
  },
  "cinnamon-rolls": () => {
    let o = plate();
    for (const [x, y] of [[150, 140], [250, 140], [200, 180]]) {
      o += `<circle cx="${x}" cy="${y}" r="44" fill="#d38c45" stroke="#a9682b" stroke-width="3"/>`;
      o += `<path d="M${x} ${y} m-4 0 a4 4 0 1 1 8 0 a10 10 0 1 1 -18 0 a16 16 0 1 1 30 0 a24 24 0 1 1 -42 0 a32 32 0 1 1 56 0" fill="none" stroke="#8a4f1d" stroke-width="4"/>`;
      o += `<path d="M${x - 30} ${y - 18} q15 10 30 -4 q15 -14 30 4" stroke="#fff6e8" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    }
    return svg("#f6e2c6", o);
  },
  "mango-ice-cream": () => {
    let o = bowl("#e9c8a0");
    o += `<circle cx="165" cy="128" r="46" fill="#f9b233"/><circle cx="235" cy="128" r="46" fill="#f7a823"/>`;
    o += `<circle cx="150" cy="112" r="10" fill="#ffffff" opacity="0.35"/><circle cx="220" cy="110" r="10" fill="#ffffff" opacity="0.35"/>`;
    o += `<path d="M190 80 q20 -30 40 -10" stroke="#2f6b3f" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    o += `<ellipse cx="236" cy="72" rx="16" ry="8" fill="#3e8e41" transform="rotate(-20 236 72)"/>`;
    return svg("#fde9c9", o);
  },
};

const pizzas = {
  margherita: { toppings: [["tomato", 5], ["basil", 9]] },
  "beef-pepperoni": { toppings: [["pepperoni", 16]] },
  "bbq-chicken-feast": { sauce: "#7a341b", toppings: [["chicken", 12], ["onion", 8], ["corn", 16]] },
  "hawaiian-chicken": { toppings: [["chicken", 10], ["pineapple", 12]] },
  "spicy-sambal-chicken": { sauce: "#b8231a", toppings: [["chicken", 11], ["chili", 14], ["onion", 6]] },
  "veggie-garden": { toppings: [["capsicum", 9], ["mushroom", 7], ["olive", 9], ["onion", 6]] },
  "seafood-deluxe": { sauce: "#efe0bf", toppings: [["prawn", 8], ["squid", 8], ["crab", 6], ["basil", 5]] },
  "meat-lovers": { toppings: [["pepperoni", 9], ["beef", 14], ["sausage", 6], ["chicken", 6]] },
};

let count = 0;
for (const [id, cfg] of Object.entries(pizzas)) {
  writeFileSync(join(OUT, `${id}.svg`), pizza(id, cfg));
  count++;
}
for (const [id, draw] of Object.entries(simple)) {
  writeFileSync(join(OUT, `${id}.svg`), draw());
  count++;
}
console.log(`Wrote ${count} images to ${OUT}`);
