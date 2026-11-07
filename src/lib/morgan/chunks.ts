import { tokens } from "./memory";

const LIMIT = 8000;
const CHUNK = 1500;

/** For long documents, keep only the chunks most relevant to the question (in original order). */
export function selectChunks(text: string, query: string, limit = LIMIT): string {
  if (text.length <= limit) return text;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
  const q = tokens(query);
  const scored = chunks.map((c, i) => {
    let s = i === 0 ? 0.5 : 0; // keep the opening for context
    for (const w of tokens(c)) if (q.has(w)) s++;
    return { i, s };
  });
  const keep = Math.max(1, Math.floor(limit / CHUNK));
  const picked = scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, keep).map((x) => x.i).sort((a, b) => a - b);
  return picked.map((i) => `[section ${i + 1}/${chunks.length}]\n${chunks[i]}`).join("\n…\n");
}
