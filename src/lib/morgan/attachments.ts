// Client-side, sandboxed file extraction. Files are parsed in the browser and never
// executed; only extracted text (and downscaled images) is sent with the message.
// Files themselves are not stored on the server.

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 5;
const MAX_TEXT = 60_000;
const ZIP_MAX_ENTRIES = 60;
const ZIP_MAX_TOTAL = 25 * 1024 * 1024;

export type Prepared =
  | { kind: "text"; name: string; mime: string; size: number; text: string; note?: string }
  | { kind: "image"; name: string; mime: string; size: number; dataUrl: string }
  | { kind: "error"; name: string; size: number; error: string };

const TEXT_EXT = /\.(txt|md|markdown|json|csv|tsv|log|xml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|sh|ya?ml|toml|ini|sql)$/i;
const ext = (n: string) => n.toLowerCase().split(".").pop() ?? "";
const clip = (t: string) => (t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + "\n…[truncated]" : t);
const xmlText = (xml: string, tag: RegExp) =>
  Array.from(xml.matchAll(tag))
    .map((m) => m[1]!)
    .join(" ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

export function supportedLabel() {
  return "PDF, DOCX, PPTX, XLSX/CSV, text/code files, images, ZIP";
}

async function downscale(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function officeText(buf: Uint8Array, e: string) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(buf, {
    filter: (f) =>
      e === "docx"
        ? f.name === "word/document.xml"
        : /^ppt\/slides\/slide\d+\.xml$/.test(f.name),
  });
  if (e === "docx") {
    const xml = strFromU8(files["word/document.xml"] ?? new Uint8Array());
    return xml
      .split(/<\/w:p>/)
      .map((p) => xmlText(p, /<w:t[^>]*>([^<]*)<\/w:t>/g))
      .filter(Boolean)
      .join("\n");
  }
  return Object.keys(files)
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((k, i) => `--- Slide ${i + 1} ---\n${xmlText(strFromU8(files[k]!), /<a:t>([^<]*)<\/a:t>/g)}`)
    .join("\n");
}

export async function prepareFile(file: File): Promise<Prepared> {
  const base = { name: file.name, size: file.size };
  if (file.size > MAX_FILE_BYTES) return { kind: "error", ...base, error: "File is larger than 15 MB." };
  const e = ext(file.name);
  try {
    if (file.type.startsWith("image/")) {
      if (!/^image\/(png|jpe?g|webp|gif|bmp)$/.test(file.type)) return { kind: "error", ...base, error: "Unsupported image format." };
      return { kind: "image", ...base, mime: "image/jpeg", dataUrl: await downscale(file) };
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    if (e === "pdf") {
      if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return { kind: "error", ...base, error: "This is not a valid PDF." };
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: true });
      const t = (Array.isArray(text) ? text.join("\n") : text).trim();
      if (!t) return { kind: "text", ...base, mime: "application/pdf", text: "", note: "scanned PDF with no text layer — attach screenshots of the pages so MORGAN can read them as images" };
      return { kind: "text", ...base, mime: "application/pdf", text: clip(t) };
    }
    if (e === "docx" || e === "pptx") {
      const t = (await officeText(buf, e)).trim();
      if (!t) return { kind: "error", ...base, error: "No readable text found in this document." };
      return { kind: "text", ...base, mime: file.type || e, text: clip(t) };
    }
    if (e === "xlsx" || e === "xls" || e === "ods") {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const t = wb.SheetNames.slice(0, 10)
        .map((n) => `--- Sheet: ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n]!)}`)
        .join("\n");
      return { kind: "text", ...base, mime: file.type || e, text: clip(t) };
    }
    if (e === "zip") {
      const { unzipSync, strFromU8 } = await import("fflate");
      let count = 0;
      let total = 0;
      const listed: string[] = [];
      const files = unzipSync(buf, {
        filter: (f) => {
          count++;
          total += f.originalSize;
          listed.push(f.name);
          if (count > ZIP_MAX_ENTRIES || total > ZIP_MAX_TOTAL) throw new Error("zip_limits");
          return TEXT_EXT.test(f.name) && f.originalSize < 2_000_000;
        },
      });
      const body = Object.entries(files)
        .map(([n, d]) => `--- ${n} ---\n${strFromU8(d)}`)
        .join("\n");
      return { kind: "text", ...base, mime: "application/zip", text: clip(`Archive contents:\n${listed.join("\n")}\n\n${body}`) };
    }
    if (file.type.startsWith("text/") || TEXT_EXT.test(file.name)) {
      const t = new TextDecoder().decode(buf);
      if (t.includes("\u0000")) return { kind: "error", ...base, error: "This file looks binary, not text." };
      return { kind: "text", ...base, mime: file.type || "text/plain", text: clip(t) };
    }
    return { kind: "error", ...base, error: `Unsupported file type. Supported: ${supportedLabel()}.` };
  } catch (err) {
    if (err instanceof Error && err.message === "zip_limits") return { kind: "error", ...base, error: "ZIP has too many files or is too large when extracted." };
    return { kind: "error", ...base, error: "Couldn't read this file — it may be damaged or password-protected." };
  }
}
