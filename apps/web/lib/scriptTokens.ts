/**
 * A small pure tokenizer for the core-generated proof-script surface (kernel
 * terms via termToString, theorem statements, definition scripts): keywords
 * like Π/λ/let/refl/subst/Type, identifiers, operators, parens and numbers.
 * It only labels text runs — the source string is reproduced exactly, so
 * rendering the tokens in order is byte-identical to the input.
 */

import type { Segment } from "./doc";
import type { TokenTag } from "./programDoc";

const KEYWORDS = new Set(["theorem", "def", "data", "where", "case", "induction", "let", "in", "fun", "match", "with", "refl", "subst", "Type", "Π", "λ", "∀"]);
const CTORS = new Set(["true", "false", "zero", "succ", "nil", "cons", "S"]);
const FNS = new Set(["negb", "add", "append", "map", "rev", "revAcc", "length", "apply", "compose"]);

const TOKEN_PATTERN = /[A-Za-z_][A-Za-z0-9_'.]*|\d+|\[\]|\+\+|::|:=|→|∘|Π|λ|∀|⊢|[=:,;|+.]|[()[\]{}]|\s+|[^\s]/gu;

function classify(token: string): TokenTag | undefined {
  if (/^\s+$/.test(token)) return undefined;
  if (KEYWORDS.has(token)) return "keyword";
  if (CTORS.has(token) || token === "[]") return "ctor";
  if (FNS.has(token)) return "fn";
  if (/^\d+$/.test(token)) return "number";
  if (token.endsWith(".rec")) return "keyword";
  if (/^[A-Z]/.test(token)) return "type";
  if (/^[A-Za-z_]/.test(token)) return undefined; // plain identifier
  if (/^[()[\]{}]$/.test(token)) return "paren";
  return "operator";
}

/** Splits `source` into ordered, tagged runs; concatenating them restores it. */
export function tokenizeScript(source: string): Segment[] {
  const out: { text: string; tag?: string }[] = [];
  for (const match of source.match(TOKEN_PATTERN) ?? []) {
    const tag = classify(match);
    const last = out.at(-1);
    if (last !== undefined && last.tag === tag) last.text += match;
    else out.push(tag === undefined ? { text: match } : { text: match, tag });
  }
  return out;
}
