/**
 * Fixity declarations for the proof language's infix operators, in the
 * classic Coq/Lean/Haskell style: each operator declares its precedence
 * (higher binds tighter), its associativity, and the display metadata a
 * printer needs (spelling and spacing). The parser and every printer are
 * driven ONLY by this table — declaring a new operator here is the whole
 * job; no parser or printer changes are required.
 *
 * Mixing operators of EQUAL precedence but DIFFERENT associativity without
 * parentheses is a parse error (as in Haskell), never a silent choice.
 */

export type Associativity = "left" | "right";

export interface OperatorFixity {
  /** Surface spelling of the operator, e.g. "++". */
  readonly symbol: string;
  /** The AST head this operator builds and prints (a call or constructor name). */
  readonly name: string;
  /** Binding strength; higher binds tighter. */
  readonly precedence: number;
  readonly associativity: Associativity;
  /** Text placed on each side of the symbol when printing. */
  readonly spacing: string;
}

/** Declares a left-associative infix operator: `a ⊕ b ⊕ c` reads `(a ⊕ b) ⊕ c`. */
export const infixl = (precedence: number, symbol: string, name: string, spacing = " "): OperatorFixity =>
  ({ symbol, name, precedence, associativity: "left", spacing });

/** Declares a right-associative infix operator: `a ⊕ b ⊕ c` reads `a ⊕ (b ⊕ c)`. */
export const infixr = (precedence: number, symbol: string, name: string, spacing = " "): OperatorFixity =>
  ({ symbol, name, precedence, associativity: "right", spacing });

/**
 * The program language's operators, with Haskell-compatible fixities:
 * `::` and `++` share level 5 and associate right (so `x :: xs ++ ys` is
 * `x :: (xs ++ ys)`, and `(x :: xs) ++ ys` needs its parentheses), `+` is
 * `infixl 6`, and composition binds tightest at `infixr 9`.
 */
export const operatorTable: readonly OperatorFixity[] = [
  infixl(6, "+", "add"),
  infixr(5, "++", "append"),
  infixr(5, "::", "cons"),
  infixr(9, "∘", "compose"),
] as const;

/** Looks an operator up by its surface spelling. */
export function operatorBySymbol(symbol: string, table: readonly OperatorFixity[] = operatorTable): OperatorFixity | undefined {
  return table.find((operator) => operator.symbol === symbol);
}

/** Looks an operator up by the AST head it builds. */
export function operatorByName(name: string, table: readonly OperatorFixity[] = operatorTable): OperatorFixity | undefined {
  return table.find((operator) => operator.name === name);
}
