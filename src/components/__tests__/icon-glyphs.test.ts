import { glyphs } from '../icon-glyphs';

const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const PAIRS: Record<string, number> = { M: 1, L: 1, T: 1, S: 2, Q: 2, C: 3 };

/** Every absolute end and control point of an SVG path, following the spec's implicit-command rules. */
function points(d: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = '';
  const skip = () => {
    while (i < d.length && /[\s,]/.test(d.charAt(i))) i += 1;
  };
  const num = () => {
    skip();
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(d);
    if (!m) throw new Error(`expected a number at ${i}: "${d.slice(i, i + 12)}"`);
    i = NUMBER.lastIndex;
    return Number(m[0]);
  };
  const flag = () => {
    skip();
    if (d.charAt(i) !== '0' && d.charAt(i) !== '1') throw new Error(`expected an arc flag at ${i}`);
    i += 1;
  };
  for (skip(); i < d.length; skip()) {
    if (/[a-z]/i.test(d.charAt(i))) {
      cmd = d.charAt(i);
      i += 1;
    } else if (cmd === 'M' || cmd === 'm') {
      cmd = cmd === 'M' ? 'L' : 'l';
    } else if (!cmd || cmd === 'Z' || cmd === 'z') {
      throw new Error(`coordinates without a command at ${i}`);
    }
    const rel = cmd === cmd.toLowerCase();
    const kind = cmd.toUpperCase();
    if (kind === 'Z') {
      x = startX;
      y = startY;
    } else if (kind === 'H') {
      x = num() + (rel ? x : 0);
      out.push([x, y]);
    } else if (kind === 'V') {
      y = num() + (rel ? y : 0);
      out.push([x, y]);
    } else if (kind === 'A') {
      num();
      num();
      num();
      flag();
      flag();
      x = num() + (rel ? x : 0);
      y = num() + (rel ? y : 0);
      out.push([x, y]);
    } else {
      const pairs = PAIRS[kind];
      if (!pairs) throw new Error(`unsupported command ${cmd}`);
      const [x0, y0] = [x, y];
      for (let k = 0; k < pairs; k += 1) {
        x = num() + (rel ? x0 : 0);
        y = num() + (rel ? y0 : 0);
        out.push([x, y]);
      }
      if (kind === 'M') [startX, startY] = [x, y];
    }
  }
  return out;
}

it('reads implicit linetos with the case of their moveto', () => {
  expect(points('m10 20 5 5')).toEqual([
    [10, 20],
    [15, 25],
  ]);
  expect(points('M10 20 5 5zm1 1a2 2 0 0110 0')).toEqual([
    [10, 20],
    [5, 5],
    [11, 21],
    [21, 21],
  ]);
});

it('keeps every icon outline inside its 256 grid', () => {
  const stray: string[] = [];
  for (const [name, glyph] of Object.entries(glyphs)) {
    for (const [layer, d] of Object.entries(glyph as Record<string, string>)) {
      const outside = points(d).some(([px, py]) => px < 0 || px > 256 || py < 0 || py > 256);
      if (!d.startsWith('M') || outside) stray.push(`${name}.${layer}`);
    }
  }
  expect(stray).toEqual([]);
});
