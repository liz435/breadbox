import { Fragment, type ReactNode } from "react"

// Lightweight syntax highlighter used by <CodeBlock>. A regex-based tokenizer
// that emits colored <span>s. Zero runtime deps; palette matches VS Code Dark+
// so code in /learn and /docs reads naturally on the #111 background.

export type SyntaxLang = "cpp" | "ts" | "tsx" | "js" | "jsx" | "json" | "text"

type TokenType =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "constant"
  | "function"
  | "preprocessor"
  | "punctuation"
  | "operator"
  | "text"

type Rule = { type: TokenType; re: RegExp }

type Token = { type: TokenType; value: string }

// Gruvbox Light — matches the sketch editor's parchment theme.
const COLOR_CLASS: Record<TokenType, string> = {
  comment: "text-[#928374] italic",
  string: "text-[#79740e]",
  number: "text-[#8f3f71]",
  keyword: "text-[#9d0006]",
  type: "text-[#b57614]",
  constant: "text-[#8f3f71]",
  function: "text-[#076678]",
  preprocessor: "text-[#427b58]",
  punctuation: "text-muted-foreground",
  operator: "text-[#af3a03]",
  text: "",
}

// ── Language rules ─────────────────────────────────────────────────────
//
// Rule order matters — the first match wins at each position. Always put
// comments and strings before keywords so `//` inside a string doesn't
// get split. All regexes are sticky (y flag) so they only match at the
// scanner's current index, which lets us reuse them in a loop without
// slicing the string.

const CPP_RULES: Rule[] = [
  { type: "comment", re: /\/\/[^\n]*/y },
  { type: "comment", re: /\/\*[\s\S]*?\*\//y },
  { type: "string", re: /"(?:\\.|[^"\\\n])*"/y },
  { type: "string", re: /'(?:\\.|[^'\\\n])*'/y },
  { type: "preprocessor", re: /#\s*include\s*<[^>\n]+>/y },
  { type: "preprocessor", re: /#\s*include\s*"[^"\n]+"/y },
  { type: "preprocessor", re: /#\s*\w+/y },
  { type: "number", re: /\b0x[0-9a-fA-F]+[uUlL]*\b/y },
  { type: "number", re: /\b0b[01]+[uUlL]*\b/y },
  { type: "number", re: /\b\d+\.?\d*(?:[eE][+-]?\d+)?[fFuUlL]*\b/y },
  {
    type: "keyword",
    re: /\b(?:if|else|for|while|do|return|break|continue|switch|case|default|new|delete|this|typedef|namespace|using|sizeof|operator|inline|virtual|override|final|friend|template|throw|try|catch)\b/y,
  },
  {
    type: "type",
    re: /\b(?:int|char|bool|float|double|void|unsigned|signed|long|short|auto|const|static|extern|volatile|struct|class|enum|union|String|byte|boolean|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|word)\b/y,
  },
  {
    type: "constant",
    re: /\b(?:true|false|NULL|nullptr|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN|CHANGE|RISING|FALLING|PI|TWO_PI|HALF_PI|DEG_TO_RAD|RAD_TO_DEG|A[0-5])\b/y,
  },
  { type: "function", re: /\b[a-zA-Z_]\w*(?=\s*\()/y },
  { type: "punctuation", re: /[{}[\]();,.]/y },
  { type: "operator", re: /[+\-*/%=&|^~!<>?:]+/y },
]

const TS_RULES: Rule[] = [
  { type: "comment", re: /\/\/[^\n]*/y },
  { type: "comment", re: /\/\*[\s\S]*?\*\//y },
  { type: "string", re: /"(?:\\.|[^"\\\n])*"/y },
  { type: "string", re: /'(?:\\.|[^'\\\n])*'/y },
  { type: "string", re: /`(?:\\[\s\S]|[^`\\])*`/y },
  { type: "number", re: /\b0x[0-9a-fA-F]+n?\b/y },
  { type: "number", re: /\b\d+\.?\d*(?:[eE][+-]?\d+)?n?\b/y },
  {
    type: "keyword",
    re: /\b(?:if|else|for|while|do|return|break|continue|switch|case|default|new|delete|throw|try|catch|finally|async|await|yield|in|of|instanceof|typeof|this|super|void|with)\b/y,
  },
  {
    type: "keyword",
    re: /\b(?:const|let|var|function|class|interface|type|enum|namespace|module|import|export|from|as|extends|implements|public|private|protected|readonly|static|abstract|declare|satisfies|keyof|infer|is)\b/y,
  },
  {
    type: "type",
    re: /\b(?:string|number|boolean|any|unknown|never|bigint|object|symbol)\b/y,
  },
  {
    type: "constant",
    re: /\b(?:true|false|null|undefined|NaN|Infinity)\b/y,
  },
  { type: "function", re: /\b[a-zA-Z_$][\w$]*(?=\s*\()/y },
  { type: "punctuation", re: /[{}[\]();,.]/y },
  { type: "operator", re: /[+\-*/%=&|^~!<>?:]+/y },
]

const JSON_RULES: Rule[] = [
  { type: "string", re: /"(?:\\.|[^"\\\n])*"(?=\s*:)/y },
  { type: "string", re: /"(?:\\.|[^"\\\n])*"/y },
  { type: "number", re: /-?\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/y },
  { type: "constant", re: /\b(?:true|false|null)\b/y },
  { type: "punctuation", re: /[{}[\],:]/y },
]

const RULES_BY_LANG: Record<SyntaxLang, Rule[]> = {
  cpp: CPP_RULES,
  ts: TS_RULES,
  tsx: TS_RULES,
  js: TS_RULES,
  jsx: TS_RULES,
  json: JSON_RULES,
  text: [],
}

function tokenize(code: string, rules: Rule[]): Token[] {
  if (rules.length === 0) return [{ type: "text", value: code }]

  const tokens: Token[] = []
  let buffer = ""
  let i = 0

  function flushBuffer() {
    if (buffer.length > 0) {
      tokens.push({ type: "text", value: buffer })
      buffer = ""
    }
  }

  while (i < code.length) {
    let matched: Token | null = null
    for (const rule of rules) {
      rule.re.lastIndex = i
      const m = rule.re.exec(code)
      if (m !== null && m.index === i) {
        matched = { type: rule.type, value: m[0] }
        break
      }
    }

    if (matched !== null) {
      flushBuffer()
      tokens.push(matched)
      i += matched.value.length
    } else {
      buffer += code[i]
      i += 1
    }
  }

  flushBuffer()
  return tokens
}

// Normalize user-supplied `lang` strings to our small set. Anything we
// don't recognize falls back to plain text rather than crashing.
function normalizeLang(lang: string): SyntaxLang {
  const key = lang.toLowerCase()
  if (key === "c" || key === "c++" || key === "cpp" || key === "arduino" || key === "ino") {
    return "cpp"
  }
  if (key === "ts" || key === "typescript") return "ts"
  if (key === "tsx") return "tsx"
  if (key === "js" || key === "javascript") return "js"
  if (key === "jsx") return "jsx"
  if (key === "json") return "json"
  return "text"
}

export function highlight(code: string, lang: string): ReactNode {
  const normalized = normalizeLang(lang)
  const rules = RULES_BY_LANG[normalized]
  const tokens = tokenize(code, rules)

  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === "text") {
          return <Fragment key={i}>{tok.value}</Fragment>
        }
        return (
          <span key={i} className={COLOR_CLASS[tok.type]}>
            {tok.value}
          </span>
        )
      })}
    </>
  )
}
