// ── Safe expression evaluator ───────────────────────────────────────────────
//
// Evaluates the small arithmetic expressions used in the custom-component DSL
// (e.g. "value / 100 * 5", "clamp(temp, 0, 100)"). Pure and allowlisted: a
// hand-written recursive-descent parser over +-*/%, comparisons, parentheses,
// unary minus, numeric literals, named variables (from a context object), and a
// fixed set of math functions. No eval/Function, no member access, no globals —
// safe to run on DSL pasted from a chatbot or supplied via MCP.

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (a) => Math.abs(a),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  round: (a) => Math.round(a),
  sqrt: (a) => Math.sqrt(a),
  pow: (a, b) => Math.pow(a, b),
  clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
};

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j]!)) j++;
      tokens.push({ type: "num", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j]!)) j++;
      tokens.push({ type: "id", value: input.slice(i, j) });
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==" || two === "!=") {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/%()<>,".includes(c)) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}" in expression`);
  }
  return tokens;
}

/** Evaluate `expr` against `context` (variable name → number). Throws on any error. */
export function evaluateExpression(expr: string, context: Record<string, number> = {}): number {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];
  const isOp = (t: Token | undefined, v: string): boolean => !!t && t.type === "op" && t.value === v;

  function parseComparison(): number {
    const left = parseAdd();
    const t = peek();
    if (t && t.type === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(t.value)) {
      next();
      const right = parseAdd();
      switch (t.value) {
        case "<": return left < right ? 1 : 0;
        case ">": return left > right ? 1 : 0;
        case "<=": return left <= right ? 1 : 0;
        case ">=": return left >= right ? 1 : 0;
        case "==": return left === right ? 1 : 0;
        default: return left !== right ? 1 : 0;
      }
    }
    return left;
  }

  function parseAdd(): number {
    let v = parseMul();
    for (let t = peek(); t && t.type === "op" && (t.value === "+" || t.value === "-"); t = peek()) {
      next();
      const r = parseMul();
      v = t.value === "+" ? v + r : v - r;
    }
    return v;
  }

  function parseMul(): number {
    let v = parseUnary();
    for (let t = peek(); t && t.type === "op" && (t.value === "*" || t.value === "/" || t.value === "%"); t = peek()) {
      next();
      const r = parseUnary();
      v = t.value === "*" ? v * r : t.value === "/" ? v / r : v % r;
    }
    return v;
  }

  function parseUnary(): number {
    const t = peek();
    if (isOp(t, "-")) { next(); return -parseUnary(); }
    if (isOp(t, "+")) { next(); return parseUnary(); }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = next();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "num") return t.value;
    if (t.type === "op" && t.value === "(") {
      const v = parseComparison();
      if (!isOp(next(), ")")) throw new Error('Expected ")"');
      return v;
    }
    if (t.type === "id") {
      if (isOp(peek(), "(")) {
        next(); // consume "("
        const args: number[] = [];
        if (!isOp(peek(), ")")) {
          args.push(parseComparison());
          while (isOp(peek(), ",")) { next(); args.push(parseComparison()); }
        }
        if (!isOp(next(), ")")) throw new Error('Expected ")"');
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new Error(`Unknown function "${t.value}"`);
        return fn(...args);
      }
      if (t.value in context) return context[t.value]!;
      throw new Error(`Unknown variable "${t.value}"`);
    }
    throw new Error(`Unexpected token "${t.value}"`);
  }

  const result = parseComparison();
  if (pos < tokens.length) throw new Error("Unexpected trailing tokens in expression");
  if (!Number.isFinite(result)) throw new Error("Expression did not evaluate to a finite number");
  return result;
}
