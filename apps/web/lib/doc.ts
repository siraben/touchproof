/**
 * A tiny Wadler-style pretty-printing library ("A prettier printer", 2003).
 *
 * Documents are built from functional combinators and rendered against a
 * maximum width: each `group` prints on one line when it fits in the space
 * remaining on the current line, and otherwise breaks at its `line`s with
 * `nest`-controlled indentation. Pure TypeScript — no dependencies, no DOM.
 */

export type Doc =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "line"; readonly flat: string }
  | { readonly kind: "concat"; readonly items: readonly Doc[] }
  | { readonly kind: "nest"; readonly indent: number; readonly doc: Doc }
  | { readonly kind: "group"; readonly doc: Doc };

/** Literal text; never broken. */
export const text = (value: string): Doc => ({ kind: "text", text: value });

/** A newline (plus current indentation) when broken; a single space when flat. */
export const line: Doc = { kind: "line", flat: " " };

/** A newline (plus current indentation) when broken; nothing when flat. */
export const softline: Doc = { kind: "line", flat: "" };

/** A newline that is never flattened (a hard break, even inside groups). */
export const hardline: Doc = { kind: "concat", items: [{ kind: "line", flat: "\n" }] };

/** Concatenation of documents in order. */
export const cat = (...items: readonly Doc[]): Doc => ({ kind: "concat", items });

/** Increases the indentation of every line broken inside `doc` by `indent`. */
export const nest = (indent: number, doc: Doc): Doc => ({ kind: "nest", indent, doc });

/** Renders `doc` on one line if it fits the remaining width, else breaks it. */
export const group = (doc: Doc): Doc => ({ kind: "group", doc });

/** The width of `doc` when printed flat (all lines rendered as their flat text). */
function flatWidth(doc: Doc): number {
  switch (doc.kind) {
    case "text": return doc.text.length;
    case "line": return doc.flat === "\n" ? Number.POSITIVE_INFINITY : doc.flat.length;
    case "concat": return doc.items.reduce((total, item) => total + flatWidth(item), 0);
    case "nest": return flatWidth(doc.doc);
    case "group": return flatWidth(doc.doc);
  }
}

/** Lays out `doc` against `maxWidth` columns using the classic fits check. */
export function render(doc: Doc, maxWidth: number): string {
  const out: string[] = [];
  let column = 0;
  const go = (current: Doc, indent: number, flat: boolean): void => {
    switch (current.kind) {
      case "text":
        out.push(current.text);
        column += current.text.length;
        return;
      case "line":
        if (flat && current.flat !== "\n") {
          out.push(current.flat);
          column += current.flat.length;
        } else {
          out.push(`\n${" ".repeat(indent)}`);
          column = indent;
        }
        return;
      case "concat":
        for (const item of current.items) go(item, indent, flat);
        return;
      case "nest":
        go(current.doc, indent + current.indent, flat);
        return;
      case "group":
        go(current.doc, indent, flat || flatWidth(current.doc) <= maxWidth - column);
        return;
    }
  };
  go(doc, 0, false);
  return out.join("");
}
