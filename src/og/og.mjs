// Open Graph images (1200x630) rendered at build time with satori + sharp.
// Every template takes plain data, so the Astro endpoints and the preview
// script share one implementation. Patterns are seeded from the page slug:
// each page gets its own heatmap, histogram or log lines, in the same style.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const W = 1200;
const H = 630;

// Design tokens (LogTide Sito, dark theme)
const C = {
  bg: 'hsl(240, 10%, 4%)',
  card: 'hsl(240, 8%, 7%)',
  fg: 'hsl(0, 0%, 98%)',
  muted: 'hsl(240, 5%, 72%)',
  dim: 'hsl(240, 5%, 64.9%)',
  border: 'hsl(240, 6%, 20%)',
  primary: 'hsl(262, 83%, 58%)',
  primaryReadable: 'hsl(265, 95%, 78%)',
  navActive: 'hsl(262, 40%, 17%)',
  navActiveFg: 'hsl(265, 95%, 80%)',
  error: 'hsl(0, 84%, 60%)',
  warning: 'hsl(38, 92%, 55%)',
  info: 'hsl(217, 91%, 62%)',
  success: 'hsl(142, 65%, 45%)',
  successText: 'hsl(142, 70%, 60%)',
};

const SANS = 'Inter';
const DISPLAY = 'Inter Tight';
const MONO = 'JetBrains Mono';

// ---------------------------------------------------------------------------
// Assets

let fontsCache;
function fonts() {
  if (fontsCache) return fontsCache;
  const file = (pkg, name) => readFileSync(require.resolve(`@fontsource/${pkg}/files/${name}`));
  fontsCache = [
    { name: DISPLAY, data: file('inter-tight', 'inter-tight-latin-700-normal.woff'), weight: 700, style: 'normal' },
    { name: SANS, data: file('inter', 'inter-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: MONO, data: file('jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: MONO, data: file('jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff'), weight: 500, style: 'normal' },
  ];
  return fontsCache;
}

let logoCache;
function logo() {
  if (!logoCache) {
    const png = readFileSync(join(process.cwd(), 'public/logo/white.png'));
    logoCache = `data:image/png;base64,${png.toString('base64')}`;
  }
  return logoCache;
}

let simpleIcons;
/** SVG data URI of a simple-icons brand icon ("simple-icons:nginx"), or null. */
export function brandIconUri(name, color = '#ffffff') {
  if (!name) return null;
  simpleIcons ??= JSON.parse(readFileSync(require.resolve('@iconify-json/simple-icons/icons.json'), 'utf8'));
  const id = name.replace(/^simple-icons:/, '');
  const icon = simpleIcons.icons[id];
  if (!icon) return null;
  const size = icon.width ?? simpleIcons.width ?? 24;
  const body = icon.body.replace(/currentColor/g, color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Helpers

/** Minimal element factory for satori: h('div', style, ...children). */
function h(type, style = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  const clean = Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined));
  const props = { style: { display: 'flex', ...clean } };
  if (type === 'img') {
    const { src, display, ...rest } = props.style;
    props.src = src;
    props.style = rest;
  } else if (kids.length === 1) props.children = kids[0];
  else if (kids.length > 1) props.children = kids;
  return { type, props };
}

/** Deterministic PRNG seeded by a string (the page slug). */
function rng(key) {
  let seed = 2166136261;
  for (const ch of String(key)) seed = Math.imul(seed ^ ch.codePointAt(0), 16777619) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Largest font size (step 2px) at which the text fits in maxLines lines of width px. */
function fitSize(text, { max, min, width, maxLines, ratio = 0.5 }) {
  for (let size = max; size > min; size -= 2) {
    const perLine = Math.floor(width / (size * ratio));
    const words = String(text).split(/\s+/);
    let lines = 1;
    let len = 0;
    for (const w of words) {
      if (len === 0) len = w.length;
      else if (len + 1 + w.length <= perLine) len += 1 + w.length;
      else { lines += 1; len = w.length; }
    }
    if (lines <= maxLines) return size;
  }
  return min;
}

function clip(text, n) {
  const s = String(text ?? '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:]$/, '')}…`;
}

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

// ---------------------------------------------------------------------------
// Shared pieces

const label = (text) =>
  h('div', {
    padding: '5px 12px', borderRadius: 6, background: C.navActive, color: C.navActiveFg,
    fontFamily: MONO, fontWeight: 500, fontSize: 16, letterSpacing: '0.08em',
  }, text);

const pill = (text) =>
  h('div', {
    padding: '5px 13px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.card,
    color: C.muted, fontFamily: MONO, fontSize: 16,
  }, text);

const mono = (text, extra = {}) => h('div', { fontFamily: MONO, fontSize: 17, color: C.muted, ...extra }, text);

const logoImg = (height = 30) => h('img', { src: logo(), height, width: Math.round(height * 3.65) });

const title = (text, opts) => {
  const size = fitSize(text, opts);
  return h('div', {
    fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1.06,
    letterSpacing: '-0.025em', color: C.fg, maxWidth: opts.width,
  }, text);
};

const lead = (text, width = 900, size = 23) =>
  h('div', { fontFamily: SANS, fontSize: size, lineHeight: 1.45, color: C.muted, maxWidth: width }, text);

const footer = (right) =>
  h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' }, logoImg(), mono(right));

const spacer = () => h('div', { flexGrow: 1 });

const layer = (style, ...children) => h('div', { position: 'absolute', top: 0, left: 0, width: W, height: H, ...style }, ...children);

function frame(backgrounds, content) {
  return h('div', { position: 'relative', width: W, height: H, background: C.bg, color: C.fg, overflow: 'hidden' },
    ...backgrounds,
    h('div', {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: '64px 72px',
      flexDirection: 'column', gap: 26,
    }, ...content),
  );
}

const glow = (at, alpha = 0.4, size = '50%') =>
  layer({ backgroundImage: `radial-gradient(ellipse at ${at}, rgba(124, 58, 237, ${alpha}) 0%, rgba(124, 58, 237, 0) ${size})` });

// ---------------------------------------------------------------------------
// Background motifs

function heatmap(key) {
  const rnd = rng(key);
  const cols = 17;
  const rows = 10;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fade = Math.min(1, (c / (cols - 1)) * 1.15) * Math.max(0, 1 - (r / rows) * 1.1);
      const v = rnd();
      const level = v > 0.9 ? 0.55 : v > 0.7 ? 0.34 : v > 0.45 ? 0.18 : 0.07;
      cells.push(h('div', { width: 32, height: 32, borderRadius: 5, background: `rgba(139, 92, 246, ${(level * fade).toFixed(3)})` }));
    }
  }
  return h('div', { position: 'absolute', top: -6, right: -6, width: 646, flexWrap: 'wrap', gap: 6 }, ...cells);
}

function histogram(key) {
  const rnd = rng(key);
  const bars = [];
  for (let i = 0; i < 60; i++) {
    const wave = 0.55 + 0.45 * Math.sin(i / 6.5 + rnd() * 0.4);
    const total = Math.round(50 + 150 * wave * (0.6 + 0.4 * rnd()));
    const err = Math.round(total * (rnd() > 0.88 ? 0.35 : 0.05 * rnd()));
    const warn = Math.round(total * (0.08 + 0.12 * rnd()));
    bars.push(h('div', { flexGrow: 1, flexDirection: 'column', justifyContent: 'flex-end' },
      h('div', { height: err, background: C.error, borderRadius: '2px 2px 0 0' }),
      h('div', { height: warn, background: C.warning }),
      h('div', { height: total - err - warn, background: C.primary }),
    ));
  }
  return [
    h('div', { position: 'absolute', left: 0, bottom: 0, width: W, height: 230, alignItems: 'flex-end', gap: 4, padding: '0 8px', opacity: 0.4 }, ...bars),
    layer({ backgroundImage: 'linear-gradient(180deg, rgb(9, 9, 11) 0%, rgb(9, 9, 11) 55%, rgba(9, 9, 11, 0.35) 100%)' }),
  ];
}

const grid = () => [
  layer({
    backgroundImage: 'linear-gradient(hsl(240, 6%, 16%) 1px, transparent 1px), linear-gradient(90deg, hsl(240, 6%, 16%) 1px, transparent 1px)',
    backgroundSize: '40px 40px, 40px 40px',
  }),
  layer({ backgroundImage: 'radial-gradient(ellipse at 30% 40%, rgb(9, 9, 11) 0%, rgba(9, 9, 11, 0.55) 45%, rgba(9, 9, 11, 0) 80%)' }),
];

const blueprint = () => [
  layer({ background: 'hsl(250, 25%, 6%)' }),
  layer({
    backgroundImage: [
      'linear-gradient(rgba(139, 92, 246, 0.22) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(139, 92, 246, 0.22) 1px, transparent 1px)',
      'linear-gradient(rgba(139, 92, 246, 0.08) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(139, 92, 246, 0.08) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: '96px 96px, 96px 96px, 24px 24px, 24px 24px',
  }),
  layer({ backgroundImage: 'radial-gradient(ellipse at 25% 45%, rgba(12, 11, 20, 0.92) 0%, rgba(12, 11, 20, 0.6) 40%, rgba(12, 11, 20, 0) 75%)' }),
];

// ---------------------------------------------------------------------------
// Templates

const templates = {
  home() {
    const rnd = rng('home');
    const bars = [];
    for (let i = 0; i < 48; i++) {
      const total = Math.round(10 + 40 * (0.5 + 0.5 * Math.sin(i / 5)) * (0.6 + 0.4 * rnd()));
      const err = i > 22 && i < 30 ? Math.round(total * 0.6) : Math.round(total * 0.06 * rnd());
      bars.push(h('div', { flexGrow: 1, flexDirection: 'column', justifyContent: 'flex-end' },
        h('div', { height: err, background: C.error }),
        h('div', { height: total - err, background: C.primary, opacity: 0.7 }),
      ));
    }
    const badge = {
      ERROR: ['rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0.3)', 'hsl(0, 90%, 72%)'],
      WARN: ['rgba(245, 158, 11, 0.15)', 'rgba(245, 158, 11, 0.3)', 'hsl(40, 95%, 62%)'],
      INFO: ['rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0.3)', 'hsl(213, 95%, 72%)'],
    };
    const rows = [
      ['14:02:11.482', 'ERROR', 'Connection refused by upstream db-primary:5432'],
      ['14:02:11.209', 'WARN', 'Retrying query (attempt 2/3) after 250ms'],
      ['14:02:10.977', 'ERROR', 'Connection refused by upstream db-primary:5432'],
      ['14:02:09.630', 'INFO', 'GET /api/v1/orders 200 in 38ms'],
      ['14:02:08.115', 'WARN', 'Pool exhausted, 12 requests waiting'],
      ['14:02:07.904', 'INFO', 'POST /api/v1/checkout 201 in 112ms'],
    ].map(([time, level, msg]) => h('div', { alignItems: 'center', gap: 14, padding: '11px 18px', borderTop: '1px solid hsl(240, 6%, 14%)', fontFamily: MONO, fontSize: 14 },
      h('div', { color: 'hsl(240, 5%, 50%)' }, time),
      h('div', {
        width: 58, justifyContent: 'center', padding: '2px 0', borderRadius: 5, fontSize: 12, fontWeight: 500,
        background: badge[level][0], border: `1px solid ${badge[level][1]}`, color: badge[level][2],
      }, level),
      h('div', { color: C.dim }, 'api'),
      h('div', { color: 'hsl(0, 0%, 92%)', whiteSpace: 'nowrap' }, msg),
    ));
    const q = (k, v) => [h('div', { color: C.primaryReadable }, k), h('div', { color: C.fg }, v)];
    return h('div', { position: 'relative', width: W, height: H, background: C.bg, color: C.fg, overflow: 'hidden' },
      glow('84% 55%', 0.38),
      h('div', {
        position: 'absolute', top: 96, left: 650, width: 720, height: 600, border: '1px solid hsl(240, 6%, 18%)', borderRadius: 14,
        background: C.card, flexDirection: 'column', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0, 0, 0, 0.5)',
      },
        h('div', { gap: 8, padding: '14px 18px', borderBottom: '1px solid hsl(240, 6%, 16%)', fontFamily: MONO, fontSize: 13, color: C.dim },
          h('div', {}, 'acme'), h('div', {}, '/'), h('div', { color: C.fg }, 'production'), h('div', {}, '/'), h('div', {}, 'Logs')),
        h('div', { flexDirection: 'column', gap: 14, padding: 18 },
          h('div', { alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontFamily: MONO, fontSize: 15 },
            ...q('service:', 'api'), ...q('-level:', 'debug'), h('div', { color: 'hsl(40, 95%, 62%)' }, '"connection refused"')),
          h('div', { alignItems: 'flex-end', gap: 3, height: 54 }, ...bars),
        ),
        h('div', { flexDirection: 'column' }, ...rows),
      ),
      layer({ backgroundImage: 'linear-gradient(90deg, rgba(9, 9, 11, 0) 85%, rgba(9, 9, 11, 0.9) 100%)' }),
      layer({ backgroundImage: 'linear-gradient(180deg, rgba(9, 9, 11, 0) 75%, rgba(9, 9, 11, 0.9) 100%)' }),
      h('div', { position: 'absolute', top: 0, left: 0, bottom: 0, width: 610, padding: '64px 0 64px 72px', flexDirection: 'column', gap: 24 },
        logoImg(34),
        spacer(),
        h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: 74, lineHeight: 1, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }, 'Own your logs.'),
        lead('Log management and SIEM, open source. Self-host it or run it in our EU cloud.', 530, 22),
        spacer(),
        mono('logtide.dev'),
      ),
    );
  },

  blog({ slug, title: t, description, tags = [], date }) {
    return frame([heatmap(slug), glow('85% 115%', 0.35)], [
      h('div', { gap: 10 }, ...tags.slice(0, 4).map(pill)),
      title(t, { max: 66, min: 44, width: 1040, maxLines: 3 }),
      lead(clip(description, 170)),
      spacer(),
      footer(date ? `logtide.dev/blog · ${formatDate(date)}` : 'logtide.dev/blog'),
    ]);
  },

  docs({ path, title: t, description }) {
    return frame([...grid(), glow('90% 105%', 0.4)], [
      h('div', { gap: 12, alignItems: 'center' }, label('DOCS'), mono(path, { fontSize: 18, color: C.dim })),
      spacer(),
      title(t, { max: 80, min: 48, width: 1040, maxLines: 2 }),
      lead(clip(description, 175), 940, 24),
      spacer(),
      footer('logtide.dev/docs'),
    ]);
  },

  changelog({ version, title: t, date, recent = [] }) {
    const TICKS = 14;
    const ticks = [];
    const labels = new Map(recent.slice(-4).map((v, i, a) => [TICKS - a.length + i, v]));
    for (let i = 0; i < TICKS; i++) {
      const current = i === TICKS - 1;
      const a = (0.15 + (0.6 * i) / (TICKS - 1)).toFixed(2);
      ticks.push(h('div', { width: 1, flexDirection: 'column', alignItems: 'center', gap: 10 },
        h('div', {
          width: current ? 18 : 10, height: current ? 18 : 10, borderRadius: 999, flexShrink: 0, marginTop: current ? -4 : 0,
          background: current ? C.primary : `rgba(161, 161, 170, ${a})`,
          boxShadow: current ? '0 0 0 6px rgba(124, 58, 237, 0.25)' : 'none',
        }),
        h('div', { fontFamily: MONO, fontSize: 15, color: current ? C.primaryReadable : 'hsl(240, 5%, 50%)' }, labels.get(i) ?? ''),
      ));
    }
    const heading = String(t).replace(/^\s*v?\d+\.\d+\.\d+\s*:\s*/, '');
    return h('div', { position: 'relative', width: W, height: H, background: C.bg, color: C.fg, overflow: 'hidden' },
      glow('100% 100%', 0.38),
      h('div', { position: 'absolute', left: 0, bottom: 104, width: W, height: 1, backgroundImage: 'linear-gradient(90deg, rgba(63, 63, 70, 0) 0%, hsl(240, 6%, 22%) 30%, hsl(262, 60%, 45%) 100%)' }),
      h('div', { position: 'absolute', left: 40, bottom: 50, width: W - 112, height: 60, justifyContent: 'space-between', alignItems: 'flex-start' }, ...ticks),
      h('div', { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: '64px 72px 150px', flexDirection: 'column', gap: 22 },
        h('div', { justifyContent: 'space-between', alignItems: 'center', width: '100%' },
          h('div', { gap: 14, alignItems: 'center' }, label('CHANGELOG'), mono(formatDate(date), { fontSize: 18, color: C.dim })),
          logoImg(),
        ),
        spacer(),
        h('div', { fontFamily: MONO, fontWeight: 500, fontSize: 96, lineHeight: 1, letterSpacing: '-0.04em', color: C.primaryReadable }, version),
        title(heading, { max: 46, min: 34, width: 1000, maxLines: 2 }),
      ),
    );
  },

  integration({ slug, title: t, description, category, difficulty, brandIcon }) {
    const rnd = rng(slug);
    const cx = 380;
    const cy = 315;
    const nodes = [];
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + rnd() * 0.3;
      const dist = 190 + rnd() * 120;
      nodes.push({ x: Math.round(cx + Math.cos(ang) * dist), y: Math.round(cy + Math.sin(ang) * dist), r: 3 + rnd() * 4, hot: rnd() > 0.6 });
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="630" viewBox="0 0 560 630">${nodes
      .map((n) => `<line x1="${n.x}" y1="${n.y}" x2="${cx}" y2="${cy}" stroke="rgba(139,92,246,0.22)" stroke-width="1.5"/>`)
      .join('')}${nodes
      .map((n) => `<circle cx="${n.x}" cy="${n.y}" r="${n.r.toFixed(1)}" fill="${n.hot ? 'rgba(167,139,250,0.7)' : 'rgba(113,113,122,0.6)'}"/>`)
      .join('')}<line x1="150" y1="${cy}" x2="${cx}" y2="${cy}" stroke="hsl(262,83%,58%)" stroke-width="3" stroke-dasharray="10 10"/></svg>`;
    const icon = brandIconUri(brandIcon, '#e4e4e7');
    const diffColor = { easy: [C.success, C.successText], medium: [C.warning, 'hsl(40, 95%, 62%)'], advanced: [C.error, 'hsl(0, 90%, 72%)'] }[difficulty];
    return h('div', { position: 'relative', width: W, height: H, background: C.bg, color: C.fg, overflow: 'hidden' },
      h('img', { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: 560, height: 630, position: 'absolute', top: 0, left: 640 }),
      glow('88% 50%', 0.32, '40%'),
      h('div', {
        position: 'absolute', top: 255, left: 960, width: 120, height: 120, borderRadius: 22, background: C.primary,
        alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 8px rgba(124, 58, 237, 0.18)',
      }, h('img', { src: logo(), width: 92, height: 25 })),
      h('div', {
        position: 'absolute', top: 265, left: 740, width: 100, height: 100, borderRadius: 20, border: '1px solid hsl(240, 6%, 22%)',
        background: 'hsl(240, 8%, 9%)', alignItems: 'center', justifyContent: 'center',
      }, icon ? h('img', { src: icon, width: 56, height: 56 }) : h('div', { fontFamily: MONO, fontSize: 40, color: C.muted }, '{ }')),
      h('div', { position: 'absolute', top: 0, left: 0, bottom: 0, width: 620, padding: '64px 0 64px 72px', flexDirection: 'column', gap: 24 },
        h('div', { gap: 10, alignItems: 'center' },
          label('INTEGRATION'),
          category ? pill(category) : null,
          diffColor ? h('div', {
            padding: '5px 13px', borderRadius: 999, fontFamily: MONO, fontSize: 16, color: diffColor[1],
            border: `1px solid ${diffColor[0].replace('hsl(', 'hsla(').replace(')', ', 0.3)')}`,
            background: diffColor[0].replace('hsl(', 'hsla(').replace(')', ', 0.15)'),
          }, difficulty) : null,
        ),
        spacer(),
        title(t, { max: 58, min: 40, width: 548, maxLines: 4 }),
        lead(clip(description, 130), 548, 22),
        spacer(),
        mono('logtide.dev/integrations'),
      ),
    );
  },

  usecase({ slug, title: t, description, category }) {
    return frame([...histogram(slug)], [
      h('div', { gap: 10, alignItems: 'center' }, label('USE CASE'), category ? pill(category) : null),
      title(t, { max: 76, min: 48, width: 1040, maxLines: 2 }),
      lead(clip(description, 140), 900, 24),
      spacer(),
      footer('logtide.dev/use-cases'),
    ]);
  },

  versus({ slug, competitor, description, path }) {
    const rnd = rng(slug);
    const cells = [];
    for (let r = 0; r < 17; r++) {
      for (let c = 0; c < 32; c++) {
        const v = rnd();
        const level = v > 0.88 ? 0.6 : v > 0.66 ? 0.38 : v > 0.4 ? 0.2 : 0.08;
        cells.push(h('div', {
          width: 32, height: 32, borderRadius: 5,
          background: c < 16 ? `rgba(139, 92, 246, ${level.toFixed(2)})` : `rgba(161, 161, 170, ${(level * 0.6).toFixed(2)})`,
        }));
      }
    }
    const size = fitSize(`LogTide vs ${competitor}`, { max: 88, min: 56, width: 1000, maxLines: 1, ratio: 0.55 });
    return h('div', { position: 'relative', width: W, height: H, background: C.bg, color: C.fg, overflow: 'hidden' },
      h('div', { position: 'absolute', top: -4, left: -4, width: 1216, flexWrap: 'wrap', gap: 6 }, ...cells),
      layer({ backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(9, 9, 11, 0.92) 0%, rgba(9, 9, 11, 0.75) 45%, rgba(9, 9, 11, 0.2) 100%)' }),
      h('div', { position: 'absolute', top: 0, left: 599, width: 2, height: H, backgroundImage: 'linear-gradient(180deg, rgba(124, 58, 237, 0) 0%, rgba(124, 58, 237, 0.5) 50%, rgba(124, 58, 237, 0) 100%)' }),
      h('div', { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: '64px 72px', flexDirection: 'column', alignItems: 'center', gap: 26 },
        label('COMPARISON'),
        spacer(),
        h('div', { alignItems: 'center', gap: 36 },
          h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1 }, 'LogTide'),
          h('div', { padding: '8px 16px', borderRadius: 10, background: C.primary, color: '#fff', fontFamily: MONO, fontWeight: 500, fontSize: 30 }, 'vs'),
          h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: size, letterSpacing: '-0.03em', lineHeight: 1, color: C.muted }, competitor),
        ),
        h('div', { fontFamily: SANS, fontSize: 24, lineHeight: 1.45, color: C.muted, maxWidth: 860, textAlign: 'center', justifyContent: 'center' }, clip(description, 120)),
        spacer(),
        footer(`logtide.dev${path ?? `/vs/${slug}/`}`),
      ),
    );
  },

  pricing({ plans }) {
    const max = Math.max(...plans.map((p) => p.gb));
    const bars = plans.map((p, i) => {
      const last = i === plans.length - 1;
      const height = Math.round(360 * Math.sqrt(p.gb / max));
      return h('div', { width: 150, flexDirection: 'column', gap: 12 },
        h('div', { flexDirection: 'column', gap: 2, fontFamily: MONO },
          h('div', { fontSize: 16, color: last ? C.primaryReadable : C.muted }, p.price ? `${p.name} · ${p.price}` : p.name),
          h('div', { fontSize: 26, fontWeight: 500, color: C.fg }, `${p.gb} GB`),
        ),
        h('div', {
          height, borderRadius: '8px 8px 0 0',
          background: last ? undefined : i === 0 ? 'hsl(240, 6%, 20%)' : 'hsl(262, 45%, 32%)',
          backgroundImage: last ? 'linear-gradient(180deg, hsl(262, 83%, 62%) 0%, hsl(262, 83%, 50%) 100%)' : undefined,
        }),
      );
    });
    return h('div', { position: 'relative', width: W, height: H, background: C.bg, color: C.fg, overflow: 'hidden' },
      glow('82% 105%', 0.42),
      h('div', { position: 'absolute', right: 72, bottom: 0, height: 470, alignItems: 'flex-end', gap: 22 }, ...bars),
      h('div', { position: 'absolute', top: 0, left: 0, bottom: 0, width: 640, padding: '64px 0 64px 72px', flexDirection: 'column', gap: 24 },
        h('div', { gap: 10, alignItems: 'center' }, label('PRICING'), mono('per month', { fontSize: 16, color: C.dim })),
        spacer(),
        h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: 70, lineHeight: 1.04, letterSpacing: '-0.03em' }, 'Fixed prices. The SIEM is in every plan.'),
        lead('Unlimited users on every plan, and never an overage fee.', 560),
        spacer(),
        h('div', { gap: 22, alignItems: 'center' }, logoImg(), mono('logtide.dev/pricing')),
      ),
    );
  },

  guide({ path, title: t, description, eyebrow }) {
    return frame([...blueprint(), glow('100% 0%', 0.35, '45%')], [
      h('div', { gap: 10, alignItems: 'center' }, label('GUIDE'), eyebrow ? mono(eyebrow, { fontSize: 16, color: 'hsl(240, 5%, 68%)' }) : null),
      spacer(),
      title(t, { max: 76, min: 48, width: 1040, maxLines: 2 }),
      lead(clip(description, 175), 920),
      spacer(),
      footer(`logtide.dev${path}`),
    ]);
  },
};

/** Renders one template to a PNG buffer. */
export async function renderOg(template, data = {}) {
  const fn = templates[template];
  if (!fn) throw new Error(`Unknown OG template: ${template}`);
  const svg = await satori(fn(data), { width: W, height: H, fonts: fonts() });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
