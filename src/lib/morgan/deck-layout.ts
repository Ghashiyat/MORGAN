// Deck Engine layout: turns a planned Deck into positioned primitives (inches, 16:9).
// Pure and unit-tested — the .pptx and .pdf backends both draw from this, so a deck
// looks the same in PowerPoint as it does in the PDF.
import { THEMES, type Deck, type DeckCard, type Slide, type Theme } from "./deck-engine";

export const PAGE = { w: 13.333, h: 7.5 };
const MX = 0.85;
const CW = PAGE.w - MX * 2;
const TOP = 0.62;
const BOT = PAGE.h - 0.75;

export type TextEl = {
  t: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  s: string;
  size: number;
  color: string;
  bold?: boolean | undefined;
  italic?: boolean | undefined;
  align?: "left" | "center" | "right" | undefined;
  valign?: "top" | "middle" | "bottom" | undefined;
  font?: "display" | "body" | undefined;
  spacing?: number | undefined;
  line?: number | undefined;
};
export type ShapeEl = { t: "rect" | "oval"; x: number; y: number; w: number; h: number; fill: string; radius?: number | undefined; opacity?: number | undefined };
/** A photo slot: `q` is the slide image query, resolved to a data URL at compile time. */
export type ImageEl = { t: "img"; x: number; y: number; w: number; h: number; q: string };
export type El = TextEl | ShapeEl | ImageEl;
export type RenderedSlide = { el: El[] };

export const WATERMARK = "MORGAN · BUILT BY GHASHIYAT";
const pad = (n: number) => String(n).padStart(2, "0");

function frame(th: Theme, i: number, total: number, kicker?: string): El[] {
  const el: El[] = [
    { t: "rect", x: 0, y: 0, w: PAGE.w, h: PAGE.h, fill: th.bg },
    { t: "oval", x: PAGE.w - 2.6, y: PAGE.h - 2.2, w: 4.2, h: 4.2, fill: th.accent, opacity: 0.06 },
    { t: "oval", x: -1.2, y: -1.4, w: 2.8, h: 2.8, fill: th.accent2, opacity: 0.05 },
    { t: "rect", x: 0, y: 0, w: PAGE.w, h: 0.06, fill: th.accent },
    { t: "rect", x: 0, y: 0, w: PAGE.w * 0.28, h: 0.06, fill: th.accent2 },
    { t: "text", x: MX, y: PAGE.h - 0.56, w: 6.5, h: 0.26, s: WATERMARK, size: 8, color: th.muted, spacing: 1.8 },
    { t: "text", x: PAGE.w - MX - 2, y: PAGE.h - 0.56, w: 2, h: 0.26, s: `${pad(i + 1)} / ${pad(total)}`, size: 8, color: th.muted, align: "right", spacing: 1.4 },
  ];
  if (kicker) el.push({ t: "text", x: MX, y: 0.28, w: 9, h: 0.24, s: kicker, size: 8.5, color: th.accent, spacing: 2.4 });
  return el;
}

/** Standard header: accent tick, headline, optional standfirst. Returns the y content starts at. */
function header(th: Theme, s: Slide, el: El[]) {
  el.push({ t: "rect", x: MX, y: TOP + 0.04, w: 0.06, h: 0.44, fill: th.accent });
  el.push({ t: "text", x: MX + 0.24, y: TOP - 0.06, w: CW - 0.4, h: 0.62, s: s.title, size: 30, color: th.text, bold: true, font: "display", valign: "middle" });
  if (s.body) el.push({ t: "text", x: MX + 0.24, y: TOP + 0.62, w: CW * 0.72, h: 0.4, s: s.body, size: 15, color: th.muted });
  return TOP + (s.body ? 1.25 : 0.92);
}

function cover(th: Theme, d: Deck, i: number, total: number): El[] {
  const s = d.slides[i]!;
  const el = frame(th, i, total);
  if (s.image) {
    // Photo cover: picture fills the right 42%, a solid accent edge joins it to the title side.
    const px = PAGE.w * 0.58;
    el.push({ t: "rect", x: px, y: 0.06, w: PAGE.w - px, h: PAGE.h - 0.06, fill: th.panel });
    el.push({ t: "img", x: px, y: 0.06, w: PAGE.w - px, h: PAGE.h - 0.06, q: s.image });
    el.push({ t: "rect", x: px - 0.08, y: 0.06, w: 0.08, h: PAGE.h - 0.06, fill: th.accent });
    el.push({ t: "rect", x: MX, y: 2.32, w: 0.09, h: 1.6, fill: th.accent });
    el.push({ t: "text", x: MX + 0.42, y: 2.1, w: px - MX - 0.9, h: 2.1, s: s.title || d.title, size: 40, color: th.text, bold: true, font: "display", valign: "top", line: 1.14 });
    const sub0 = s.subtitle || d.subtitle;
    if (sub0) el.push({ t: "text", x: MX + 0.42, y: 4.4, w: px - MX - 0.9, h: 1.0, s: sub0, size: 16, color: th.muted });
    return el;
  }
  el.push({ t: "oval", x: PAGE.w - 3.8, y: -2.1, w: 5.6, h: 5.6, fill: th.panel, opacity: 0.6 });
  el.push({ t: "oval", x: PAGE.w - 2.2, y: 3.8, w: 3.6, h: 3.6, fill: th.accent, opacity: 0.12 });
  el.push({ t: "rect", x: MX, y: 2.32, w: 0.09, h: 1.6, fill: th.accent });
  el.push({ t: "text", x: MX + 0.42, y: 2.25, w: CW - 1.8, h: 1.8, s: s.title || d.title, size: 46, color: th.text, bold: true, font: "display", valign: "top", line: 1.14 });
  const sub = s.subtitle || d.subtitle;
  if (sub) el.push({ t: "text", x: MX + 0.42, y: 4.25, w: 8.6, h: 0.8, s: sub, size: 18, color: th.muted });
  return el;
}

function section(th: Theme, s: Slide, i: number, total: number, n: number): El[] {
  const el = frame(th, i, total);
  el.push({ t: "text", x: MX, y: 1.9, w: 3, h: 1.2, s: pad(n), size: 54, color: th.accent, bold: true, font: "display", valign: "middle" });
  el.push({ t: "oval", x: PAGE.w - 5.2, y: 1.2, w: 5, h: 5, fill: th.panel, opacity: 0.7 });
  el.push({ t: "oval", x: PAGE.w - 3.6, y: 2.8, w: 1.8, h: 1.8, fill: th.accent2, opacity: 0.25 });
  el.push({ t: "text", x: MX, y: 3.75, w: CW - 1, h: 1.3, s: s.title, size: 36, color: th.text, bold: true, font: "display", valign: "top", line: 1.15 });
  if (s.body) el.push({ t: "text", x: MX, y: 5.15, w: CW * 0.7, h: 0.7, s: s.body, size: 16, color: th.muted });
  return el;
}

function bullets(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  const y0 = header(th, s, el);
  const pts = s.points ?? (s.body ? [s.body] : []);
  if (!pts.length) return el;
  const gap = 0.16;
  const h = Math.min(1.05, (BOT - y0 - gap * (pts.length - 1)) / pts.length);
  const top = y0 + Math.max(0, (BOT - 0.2 - y0 - (h * pts.length + gap * (pts.length - 1))) / 2);
  pts.forEach((p, k) => {
    const y = top + k * (h + gap);
    el.push({ t: "rect", x: MX, y, w: CW, h, fill: th.panel, radius: 0.06 });
    const d = Math.min(0.5, h - 0.2);
    el.push({ t: "oval", x: MX + 0.24, y: y + (h - d) / 2, w: d, h: d, fill: k % 2 ? th.accent2 : th.accent, opacity: 0.9 });
    el.push({ t: "text", x: MX + 0.24, y: y + (h - d) / 2, w: d, h: d, s: String(k + 1), size: 13, color: th.bg, bold: true, align: "center", valign: "middle" });
    el.push({ t: "text", x: MX + 1.0, y, w: CW - 1.3, h, s: p, size: 16, color: th.text, valign: "middle" });
  });
  return el;
}

function bento(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  const y0 = header(th, s, el);
  const cs = s.cards ?? [];
  if (!cs.length) return el;
  const cols = cs.length <= 3 ? cs.length : 2;
  const rows = Math.ceil(cs.length / cols);
  const gap = 0.3;
  const w = (CW - gap * (cols - 1)) / cols;
  const h = Math.min(rows === 1 ? 3.4 : 2.6, (BOT - 0.2 - y0 - gap * (rows - 1)) / rows);
  cs.forEach((c, k) => {
    const x = MX + (k % cols) * (w + gap);
    const y = y0 + Math.floor(k / cols) * (h + gap);
    el.push({ t: "rect", x, y, w, h, fill: th.panel, radius: 0.08 });
    el.push({ t: "rect", x, y, w: 0.07, h, fill: k % 2 ? th.accent2 : th.accent });
    el.push({ t: "oval", x: x + 0.3, y: y + 0.28, w: 0.46, h: 0.46, fill: k % 2 ? th.accent2 : th.accent, opacity: 0.18 });
    el.push({ t: "text", x: x + 0.3, y: y + 0.28, w: 0.46, h: 0.46, s: pad(k + 1), size: 11, color: k % 2 ? th.accent2 : th.accent, bold: true, align: "center", valign: "middle" });
    el.push({ t: "text", x: x + 0.3, y: y + 0.86, w: w - 0.6, h: 0.46, s: c.title, size: 18, color: th.text, bold: true, font: "display" });
    el.push({ t: "text", x: x + 0.3, y: y + 1.36, w: w - 0.6, h: Math.max(0.4, h - 1.55), s: c.body, size: 14, color: th.muted, line: 1.3 });
  });
  return el;
}

function split(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  const y0 = header(th, s, el);
  const halves = [s.left, s.right].filter((c): c is DeckCard => !!c && (!!c.title || !!c.body));
  if (!halves.length) return el;
  const gap = 0.36;
  const w = (CW - gap * (halves.length - 1)) / halves.length;
  const h = Math.min(3.6, BOT - 0.2 - y0);
  halves.forEach((c, k) => {
    const x = MX + k * (w + gap);
    el.push({ t: "rect", x, y: y0, w, h, fill: th.panel, radius: 0.08 });
    el.push({ t: "rect", x, y: y0, w, h: 0.055, fill: k ? th.accent : th.accent2 });
    el.push({ t: "text", x: x + 0.34, y: y0 + 0.3, w: w - 0.68, h: 0.34, s: c.title || (k ? "The shift" : "Today"), size: 14, color: k ? th.accent : th.accent2, bold: true, spacing: 1.6 });
    el.push({ t: "text", x: x + 0.34, y: y0 + 0.82, w: w - 0.68, h: h - 1.15, s: c.body, size: 19, color: th.text, line: 1.4 });
  });
  return el;
}

function stats(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  const y0 = header(th, s, el);
  const st = s.stats ?? [];
  if (!st.length) return el;
  const gap = 0.3;
  const w = (CW - gap * (st.length - 1)) / st.length;
  const h = Math.min(3.4, BOT - 0.2 - y0);
  st.forEach((v, k) => {
    const x = MX + k * (w + gap);
    el.push({ t: "rect", x, y: y0, w, h, fill: th.panel, radius: 0.08 });
    el.push({ t: "rect", x, y: y0, w: 0.06, h, fill: k % 2 ? th.accent2 : th.accent });
    el.push({ t: "text", x: x + 0.24, y: y0 + 0.24, w: w - 0.48, h: h * 0.5, s: v.value, size: 46, color: th.accent, bold: true, font: "display", valign: "middle" });
    el.push({ t: "text", x: x + 0.24, y: y0 + h - 0.86, w: w - 0.48, h: 0.66, s: v.label, size: 14, color: th.muted });
  });
  return el;
}

function timeline(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  const y0 = header(th, s, el);
  const st = s.steps ?? [];
  if (!st.length) return el;
  const gap = 0.24;
  const w = (CW - gap * (st.length - 1)) / st.length;
  const lineY = y0 + (BOT - y0) * 0.42;
  el.push({ t: "rect", x: MX, y: lineY, w: CW, h: 0.035, fill: th.panelSoft });
  st.forEach((v, k) => {
    const x = MX + k * (w + gap);
    el.push({ t: "oval", x: x + w / 2 - 0.09, y: lineY - 0.075, w: 0.18, h: 0.18, fill: k % 2 ? th.accent2 : th.accent });
    el.push({ t: "text", x, y: lineY - 0.66, w, h: 0.44, s: v.label, size: 15, color: th.text, bold: true, font: "display", align: "center", valign: "bottom" });
    el.push({ t: "text", x: x + 0.06, y: lineY + 0.36, w: w - 0.12, h: Math.max(0.5, BOT - (lineY + 0.36)), s: v.body, size: 13, color: th.muted, align: "center" });
  });
  return el;
}

function quote(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  el.push({ t: "oval", x: -1.5, y: -1.7, w: 4.2, h: 4.2, fill: th.panel, opacity: 0.55 });
  el.push({ t: "text", x: MX, y: 1.15, w: 1.6, h: 1.3, s: "\u201C", size: 62, color: th.accent, bold: true, font: "display", valign: "top" });
  el.push({ t: "text", x: MX + 0.5, y: 2.45, w: CW - 1.7, h: 2.3, s: s.title, size: 30, color: th.text, bold: true, font: "display", line: 1.28 });
  if (s.subtitle) el.push({ t: "text", x: MX + 0.5, y: 5.05, w: CW - 1.7, h: 0.4, s: s.subtitle, size: 12, color: th.muted, spacing: 1.6 });
  return el;
}

function visual(th: Theme, s: Slide, i: number, total: number, kicker: string, flip: boolean): El[] {
  const el = frame(th, i, total, kicker);
  const iw = 5.3;
  const ix = flip ? MX : PAGE.w - MX - iw;
  const iy = TOP + 0.05;
  const ih = BOT - iy - 0.1;
  const tx = flip ? MX + iw + 0.5 : MX;
  const tw = CW - iw - 0.5;
  el.push({ t: "rect", x: ix + (flip ? -0.14 : 0.14), y: iy + 0.14, w: iw, h: ih, fill: th.accent, radius: 0.08, opacity: 0.35 });
  el.push({ t: "rect", x: ix, y: iy, w: iw, h: ih, fill: th.panel, radius: 0.08 });
  if (s.image) el.push({ t: "img", x: ix, y: iy, w: iw, h: ih, q: s.image });
  el.push({ t: "rect", x: tx, y: TOP + 0.08, w: 0.06, h: 0.5, fill: th.accent });
  el.push({ t: "text", x: tx + 0.24, y: TOP - 0.02, w: tw - 0.24, h: 1.3, s: s.title, size: 28, color: th.text, bold: true, font: "display", line: 1.15 });
  let y = TOP + 1.4;
  if (s.body) {
    el.push({ t: "text", x: tx + 0.24, y, w: tw - 0.24, h: 1.25, s: s.body, size: 15, color: th.muted, line: 1.35 });
    y += 1.4;
  }
  const pts = (s.points ?? []).slice(0, 4);
  const ph = pts.length ? Math.min(0.85, (BOT - 0.15 - y) / pts.length) : 0;
  pts.forEach((p, k) => {
    const py = y + k * ph;
    el.push({ t: "oval", x: tx + 0.26, y: py + 0.12, w: 0.16, h: 0.16, fill: k % 2 ? th.accent2 : th.accent });
    el.push({ t: "text", x: tx + 0.6, y: py, w: tw - 0.6, h: ph - 0.06, s: p, size: 14, color: th.text, line: 1.3 });
  });
  return el;
}

function cta(th: Theme, s: Slide, i: number, total: number, kicker: string): El[] {
  const el = frame(th, i, total, kicker);
  el.push({ t: "oval", x: PAGE.w / 2 - 3, y: PAGE.h / 2 - 3.2, w: 6, h: 6, fill: th.panel, opacity: 0.75 });
  el.push({ t: "oval", x: PAGE.w / 2 - 0.35, y: 1.75, w: 0.7, h: 0.7, fill: th.accent, opacity: 0.9 });
  el.push({ t: "text", x: MX + 1, y: 2.75, w: CW - 2, h: 1.2, s: s.title, size: 36, color: th.text, bold: true, font: "display", align: "center", valign: "middle" });
  if (s.body) el.push({ t: "text", x: MX + 1.6, y: 4.15, w: CW - 3.2, h: 1.1, s: s.body, size: 17, color: th.muted, align: "center", valign: "top" });
  return el;
}

/** Turn a planned deck into one renderable slide per entry. */
export function layoutDeck(deck: Deck, opts: { watermark?: boolean } = {}): RenderedSlide[] {
  const keepMark = opts.watermark !== false;
  const th = THEMES[deck.theme] ?? THEMES.obsidian;
  const total = deck.slides.length;
  const kicker = (deck.title || "MORGAN").toUpperCase().slice(0, 60);
  let n = 0;
  let v = 0;
  return deck.slides.map((s, i) => {
    const el =
      s.layout === "cover"
        ? cover(th, deck, i, total)
        : s.layout === "section"
          ? section(th, s, i, total, (n += 1))
          : s.layout === "bento"
            ? bento(th, s, i, total, kicker)
            : s.layout === "visual"
              ? visual(th, s, i, total, kicker, (v += 1) % 2 === 0)
              : s.layout === "split"
              ? split(th, s, i, total, kicker)
              : s.layout === "stats"
                ? stats(th, s, i, total, kicker)
                : s.layout === "timeline"
                  ? timeline(th, s, i, total, kicker)
                  : s.layout === "quote"
                    ? quote(th, s, i, total, kicker)
                    : s.layout === "cta"
                      ? cta(th, s, i, total, kicker)
                      : bullets(th, s, i, total, kicker);
    return { el: keepMark ? el : el.filter((e) => !(e.t === "text" && e.s === WATERMARK)) };
  });
}
