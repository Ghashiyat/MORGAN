// Deck Engine compiler: turns a planned Deck into a real .pptx or .pdf file, in the browser.
// Both writers are imported lazily inside the functions, so they never enter the main
// bundle, never run during SSR, and cost nothing until a user actually taps Download.
import type PptxGenJS from "pptxgenjs";
import type { jsPDF } from "jspdf";
import type { Deck } from "./deck-engine";
import { layoutDeck, PAGE, type El, type RenderedSlide, type TextEl } from "./deck-layout";
import { resolveDeckImages } from "./deck-images";

/** Lay out the deck and fetch its photos in parallel; a missing photo keeps its panel. */
async function prepare(deck: Deck, opts: DeckFileOpts): Promise<{ slides: RenderedSlide[]; imgs: Map<string, string> }> {
  const slides = layoutDeck(deck, opts);
  const aspect = new Map<string, number>();
  for (const sl of slides) for (const e of sl.el) if (e.t === "img") aspect.set(e.q, e.w / e.h);
  const imgs = aspect.size ? await resolveDeckImages(deck, (q) => aspect.get(q) ?? 1.5).catch(() => new Map<string, string>()) : new Map<string, string>();
  return { slides, imgs };
}

type PptxInstance = InstanceType<typeof PptxGenJS>;
type PSlide = ReturnType<PptxInstance["addSlide"]>;

const hex = (c: string) => c.replace("#", "").toUpperCase();
const rgb = (c: string): [number, number, number] => {
  const h = hex(c);
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
/** PDFs have no alpha, so a translucent shape is pre-blended with the slide background. */
const blend = (fg: string, bg: string, a: number): string => {
  const f = rgb(fg);
  const b = rgb(bg);
  const mix = f.map((v, i) => Math.round(v * a + (b[i] ?? 0) * (1 - a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

const DISPLAY = "Trebuchet MS";
const BODY = "Calibri";

export type DeckFileOpts = { watermark?: boolean };

export async function compilePptx(deck: Deck, opts: DeckFileOpts = {}): Promise<Blob> {
  const { default: Pptx } = await import("pptxgenjs");
  const pptx = new Pptx();
  pptx.defineLayout({ name: "MORGAN16x9", width: PAGE.w, height: PAGE.h });
  pptx.layout = "MORGAN16x9";
  pptx.author = "MORGAN";
  if (opts.watermark !== false) pptx.company = "Built by Ghashiyat";
  pptx.title = deck.title;
  pptx.subject = deck.subtitle || deck.title;

  const { slides, imgs } = await prepare(deck, opts);
  const draw = (s: PSlide, el: El) => {
    if (el.t === "img") {
      const d = imgs.get(el.q);
      if (d) s.addImage({ data: d, x: el.x, y: el.y, w: el.w, h: el.h });
      return;
    }
    if (el.t === "text") {
      s.addText(el.s, {
        x: el.x,
        y: el.y,
        w: el.w,
        h: el.h,
        fontSize: el.size,
        fontFace: el.font === "display" ? DISPLAY : BODY,
        color: hex(el.color),
        bold: !!el.bold,
        italic: !!el.italic,
        align: el.align ?? "left",
        valign: el.valign ?? "top",
        charSpacing: el.spacing ?? 0,
        lineSpacing: Math.round(el.size * (el.line ?? 1.32) * 100) / 100,
        fit: "shrink",
        isTextBox: true,
        wrap: true,
      });
      return;
    }
    s.addShape(el.t === "oval" ? pptx.ShapeType.ellipse : el.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
      x: el.x,
      y: el.y,
      w: el.w,
      h: el.h,
      fill: { color: hex(el.fill), transparency: Math.round((1 - (el.opacity ?? 1)) * 100) },
      line: { type: "none" },
      ...(el.radius && el.t === "rect" ? { rectRadius: el.radius } : {}),
    });
  };

  for (const slide of slides) {
    const s = pptx.addSlide();
    for (const el of slide.el) draw(s, el);
  }
  const out = await pptx.write({ outputType: "blob" });
  return out as Blob;
}

function pdfText(doc: jsPDF, e: TextEl) {
  const [r, g, b] = rgb(e.color);
  doc.setFont("helvetica", e.bold ? "bold" : "normal");
  doc.setTextColor(r, g, b);
  let size = e.size;
  doc.setFontSize(size);
  const width = Math.max(0.4, e.w);
  let lines = doc.splitTextToSize(e.s, width) as string[];
  const step = () => (size * (e.line ?? 1.32)) / 72;
  // Shrink until the block fits its box, so nothing spills over the page edge.
  for (let k = 0; k < 6 && lines.length * step() > e.h + 0.03 && size > 7; k++) {
    size = Math.max(7, size * 0.9);
    doc.setFontSize(size);
    lines = doc.splitTextToSize(e.s, width) as string[];
  }
  const lh = step();
  const block = lines.length * lh;
  const y0 = e.valign === "middle" ? e.y + (e.h - block) / 2 : e.valign === "bottom" ? e.y + e.h - block : e.y;
  const x = e.align === "center" ? e.x + e.w / 2 : e.align === "right" ? e.x + e.w : e.x;
  doc.setCharSpace((e.spacing ?? 0) / 72);
  let y = y0 + lh * 0.78;
  for (const ln of lines) {
    doc.text(ln, x, y, { align: e.align ?? "left" });
    y += lh;
  }
  doc.setCharSpace(0);
}

export async function compilePdf(deck: Deck, opts: DeckFileOpts = {}): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [PAGE.w, PAGE.h], compress: true });
  const { slides, imgs } = await prepare(deck, opts);
  slides.forEach((slide, i) => {
    if (i) doc.addPage([PAGE.w, PAGE.h], "landscape");
    const bg = slide.el[0]?.t === "rect" ? slide.el[0].fill : "#000000";
    for (const el of slide.el) {
      if (el.t === "img") {
        const d = imgs.get(el.q);
        if (d) doc.addImage(d, "JPEG", el.x, el.y, el.w, el.h);
        continue;
      }
      if (el.t === "text") {
        pdfText(doc, el);
        continue;
      }
      const fill = el.opacity === undefined ? el.fill : blend(el.fill, bg, el.opacity);
      const [r, g, b] = rgb(fill);
      doc.setFillColor(r, g, b);
      if (el.t === "oval") doc.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, "F");
      else if (el.radius) doc.roundedRect(el.x, el.y, el.w, el.h, el.radius, el.radius, "F");
      else doc.rect(el.x, el.y, el.w, el.h, "F");
    }
  });
  return doc.output("blob");
}

export function deckSlug(title: string): string {
  return (
    String(title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "morgan-deck"
  );
}

/** Build the file and hand it to the browser as a download. */
/** Build and validate a file: a .pptx must be a zip (PK), a .pdf must start with %PDF. */
export async function buildDeckFile(deck: Deck, format: "pptx" | "pdf", opts: DeckFileOpts = {}): Promise<Blob> {
  const blob = format === "pptx" ? await compilePptx(deck, opts) : await compilePdf(deck, opts);
  if (!blob || blob.size < 1024) throw new Error("empty file");
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const ok = format === "pptx" ? head[0] === 0x50 && head[1] === 0x4b : String.fromCharCode(...head) === "%PDF";
  if (!ok) throw new Error("invalid file");
  const type = format === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/pdf";
  return new Blob([blob], { type });
}

export async function downloadDeck(deck: Deck, format: "pptx" | "pdf", opts: DeckFileOpts = {}): Promise<void> {
  const blob = await buildDeckFile(deck, format, opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${deckSlug(deck.title)}.${format}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
