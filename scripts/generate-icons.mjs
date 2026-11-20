// Extracts only the icons (and weights) Daybook uses from phosphor-react-native into a tiny
// static path table, so the app ships a few KB of SVG data instead of the whole icon library.
// Usage: node scripts/generate-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defsDir = path.join(root, 'node_modules', 'phosphor-react-native', 'src', 'defs');
const outFile = path.join(root, 'src', 'components', 'icon-glyphs.ts');

// r = regular, b = bold, f = fill, t = duotone (tint layer; detail layer is regular unless it differs)
const ICONS = {
  // navigation
  'sun-horizon': 'rf',
  notebook: 'rf',
  'check-circle': 'rfb',
  wallet: 'rf',
  plus: 'rb',
  x: 'rb',
  check: 'rb',
  'caret-left': 'rb',
  'caret-right': 'rb',
  'caret-down': 'rb',
  'caret-up': 'rb',
  'dots-three': 'rb',
  'magnifying-glass': 'rb',
  'gear-six': 'r',
  'arrow-right': 'rb',
  'arrow-up': 'rb',
  'arrow-down': 'rb',
  // actions
  trash: 'r',
  'arrow-counter-clockwise': 'r',
  archive: 'r',
  'push-pin': 'rfb',
  'push-pin-slash': 'r',
  export: 'r',
  copy: 'r',
  'pencil-simple': 'r',
  'note-pencil': 'r',
  'paper-plane-right': 'rf',
  'download-simple': 'r',
  'upload-simple': 'r',
  // meta
  hash: 'rb',
  clock: 'rb',
  bell: 'rbf',
  'bell-slash': 'r',
  repeat: 'rb',
  flag: 'rfb',
  'calendar-blank': 'rb',
  'calendar-check': 'r',
  'calendar-dots': 'r',
  alarm: 'r',
  tray: 'r',
  'clock-counter-clockwise': 'r',
  'circle-dashed': 'r',
  // editor
  'text-h': 'rb',
  'list-bullets': 'rb',
  'check-square': 'rbf',
  square: 'rb',
  quotes: 'rf',
  palette: 'r',
  keyboard: 'r',
  backspace: 'r',
  // security & settings
  lock: 'rf',
  'lock-open': 'r',
  fingerprint: 'r',
  'shield-check': 'rt',
  eye: 'r',
  'eye-slash': 'r',
  sun: 'r',
  moon: 'r',
  'circle-half': 'r',
  info: 'r',
  'cloud-slash': 'rt',
  warning: 'r',
  // money
  'arrow-up-right': 'rb',
  'arrow-down-left': 'rb',
  'arrow-up-left': 'r',
  handshake: 'rt',
  users: 'rt',
  'user-plus': 'r',
  user: 'r',
  phone: 'r',
  receipt: 'rt',
  target: 'r',
  'trend-up': 'rb',
  'trend-down': 'rb',
  coins: 'r',
  'qr-code': 'r',
  money: 'r',
  'credit-card': 'r',
  bank: 'r',
  'whatsapp-logo': 'r',
  'chat-circle-text': 'r',
  'chart-bar': 'r',
  calculator: 'r',
  'seal-check': 'rf',
  stamp: 'rt',
  // misc
  sparkle: 'rf',
  'hand-waving': 'rt',
  notepad: 'rt',
  'list-checks': 'r',
  minus: 'rb',
  equals: 'rb',
  divide: 'rb',
  // expense categories
  'fork-knife': 'rt',
  basket: 'rt',
  taxi: 'rt',
  'shopping-bag': 'rt',
  lightning: 'rt',
  house: 'rt',
  heartbeat: 'rt',
  'film-slate': 'rt',
  'airplane-tilt': 'rt',
  coffee: 'rt',
  'graduation-cap': 'rt',
  gift: 'rt',
  'device-mobile': 'rt',
  'dots-three-circle': 'rt',
};

const pascal = (kebab) =>
  kebab
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

const WEIGHTS = ['bold', 'duotone', 'fill', 'light', 'regular', 'thin'];

const NUMBER = /[\s,]*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/**
 * Makes a path's leading relative moveto absolute so several paths can be joined into one string.
 * Coordinate pairs straight after a moveto are implicit linetos that take its case, so they get an
 * explicit relative "l" — otherwise "m10 20 5 5" would turn into an absolute line to (5, 5).
 */
function absoluteStart(d) {
  if (d[0] !== 'm') return d;
  let end = 1;
  for (let k = 0; k < 2; k++) {
    NUMBER.lastIndex = end;
    if (!NUMBER.exec(d)) throw new Error(`Unexpected path start: ${d.slice(0, 24)}`);
    end = NUMBER.lastIndex;
  }
  const rest = d.slice(end).replace(/^[\s,]+/, '');
  return `M${d.slice(1, end)}${/^[+\-.\d]/.test(rest) ? 'l' : ''}${rest}`;
}

function readWeights(file) {
  const src = readFileSync(file, 'utf8');
  const marks = WEIGHTS.map((w) => ({ w, i: src.indexOf(`'${w}',`) }))
    .filter((m) => m.i >= 0)
    .sort((a, b) => a.i - b.i);
  const out = {};
  marks.forEach((m, idx) => {
    const chunk = src.slice(m.i, idx + 1 < marks.length ? marks[idx + 1].i : undefined);
    out[m.w] = [...chunk.matchAll(/<Path\b([\s\S]*?)\/>/g)].map((p) => {
      const d = /\bd="([^"]+)"/.exec(p[1])?.[1];
      if (!d) throw new Error(`Path without d in ${file}`);
      return { d: absoluteStart(d), tint: /opacity=\{duotoneOpacity\}/.test(p[1]) };
    });
  });
  return out;
}

const join = (paths) => paths.map((p) => p.d).join('');
const lines = [];
let bytes = 0;
for (const [name, weights] of Object.entries(ICONS)) {
  const w = readWeights(path.join(defsDir, `${pascal(name)}.tsx`));
  const entry = {};
  for (const k of weights) {
    if (k === 'r') entry.r = join(w.regular);
    else if (k === 'b') entry.b = join(w.bold);
    else if (k === 'f') entry.f = join(w.fill);
    else if (k === 't') {
      const tint = w.duotone.filter((p) => p.tint);
      const detail = join(w.duotone.filter((p) => !p.tint));
      if (!tint.length) throw new Error(`${name} has no duotone tint layer`);
      entry.t = join(tint);
      if (detail !== join(w.regular)) entry.d = detail;
    }
  }
  bytes += Object.values(entry).reduce((n, s) => n + s.length, 0);
  const body = Object.entries(entry)
    .map(([k, v]) => `${k}: '${v}'`)
    .join(', ');
  lines.push(`  '${name}': { ${body} },`);
}

const header = `/* eslint-disable */
// GENERATED by scripts/generate-icons.mjs — do not edit by hand.
// Glyph outlines from Phosphor Icons (https://phosphoricons.com), MIT License,
// Copyright (c) 2020-2023 Phosphor Icons. Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software, to deal in the Software without restriction, subject to including
// this notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
// Keys: r = regular, b = bold, f = fill, t = duotone tint layer, d = duotone detail layer when it
// differs from regular. viewBox 0 0 256 256.
`;
writeFileSync(outFile, `${header}export const glyphs = {\n${lines.join('\n')}\n} as const;\n\nexport type IconName = keyof typeof glyphs;\n`);
console.log(`wrote ${Object.keys(ICONS).length} icons, ${(bytes / 1024).toFixed(1)} KB path data -> ${path.relative(root, outFile)}`);
