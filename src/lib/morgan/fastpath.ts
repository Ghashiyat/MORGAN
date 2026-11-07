// Local fast-path for unambiguous arithmetic. Safe recursive-descent parser — never eval().

const EXPR = /^[\d\s+\-*/×÷x^().%,]+$/i;

/** Returns a reply string for pure arithmetic like "1+1", "what is 12 * 4?", "25% of 200"; otherwise null. */
export function localAnswer(input: string): string | null {
  let t = input.trim().toLowerCase().replace(/[?!=]+$/g, "").trim();
  t = t.replace(/^(what'?s|what is|calculate|compute|solve)\s+/, "").trim();
  const pct = t.match(/^(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)$/);
  if (pct) return fmt((Number(pct[1]) / 100) * Number(pct[2]));
  if (!EXPR.test(t) || !/\d/.test(t) || !/[+\-*/×÷x^%]/.test(t.replace(/^-/, ""))) return null;
  const v = evaluate(t.replace(/,/g, "").replace(/[×x]/g, "*").replace(/÷/g, "/"));
  return v === null ? null : fmt(v);
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return "That's undefined — can't divide by zero.";
  return String(Math.round(v * 1e10) / 1e10);
}

export function evaluate(src: string): number | null {
  const s = src.replace(/\s+/g, "");
  let i = 0;
  const peek = () => s[i];
  function num(): number | null {
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) return null;
    i += m[0].length;
    let v = Number(m[0]);
    if (peek() === "%") { i++; v /= 100; }
    return v;
  }
  function atom(): number | null {
    if (peek() === "-") { i++; const v = atom(); return v === null ? null : -v; }
    if (peek() === "+") { i++; return atom(); }
    if (peek() === "(") {
      i++;
      const v = add();
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    return num();
  }
  function pow(): number | null {
    const b = atom();
    if (b === null) return null;
    if (peek() === "^") { i++; const e = pow(); return e === null ? null : b ** e; }
    return b;
  }
  function mul(): number | null {
    let v = pow();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = s[i++];
      const r = pow();
      if (r === null) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function add(): number | null {
    let v = mul();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = s[i++];
      const r = mul();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = add();
  return v === null || i !== s.length ? null : v;
}
