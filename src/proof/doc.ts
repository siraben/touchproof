/**
 * A tiny Wadler-style pretty-printing library ("A prettier printer", 2003),
 * extended with annotations in the classic style: `annotate(tag, doc)` carries
 * a tag through grouping, nesting and flattening unchanged, and the segment
 * renderer emits ordered text runs labelled with their innermost tag (used by
 * interfaces for syntax highlighting). Pure TypeScript — no dependencies, no
 * DOM, no floating point.
 *
 * Documents are built from functional combinators and rendered against a
 * maximum width: each `group` prints on one line when it fits in the space
 * remaining on the current line, and otherwise breaks at its `line`s with
 * `nest`-controlled indentation.
 */

export type Doc =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "line"; readonly flat: string }
  | { readonly kind: "concat"; readonly items: readonly Doc[] }
  | { readonly kind: "nest"; readonly indent: number; readonly doc: Doc }
  | { readonly kind: "group"; readonly doc: Doc }
  | { readonly kind: "annotate"; readonly tag: string; readonly doc: Doc };

/** A rendered run of text carrying the innermost annotation tag, if any. */
export interface Segment {
  readonly text: string;
  readonly tag?: string;
}

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

/** Tags every text run inside `doc`; layout is completely unaffected. */
export const annotate = (tag: string, doc: Doc): Doc => ({ kind: "annotate", tag, doc });

/** The width of `doc` when printed flat (all lines rendered as their flat text). */
function flatWidth(doc: Doc): number {
  switch (doc.kind) {
    case "text": return doc.text.length;
    case "line": return doc.flat === "\n" ? Number.POSITIVE_INFINITY : doc.flat.length;
    case "concat": return doc.items.reduce((total, item) => total + flatWidth(item), 0);
    case "nest": return flatWidth(doc.doc);
    case "group": return flatWidth(doc.doc);
    case "annotate": return flatWidth(doc.doc);
  }
}

/**
 * Lays out `doc` against `maxWidth` columns using the classic fits check and
 * returns ordered segments labelled with their innermost annotation tag.
 * Adjacent same-tag runs are merged.
 */
export function renderSegments(doc: Doc, maxWidth: number): Segment[] {
  const out: { text: string; tag?: string }[] = [];
  let column = 0;
  const push = (value: string, tag?: string): void => {
    const last = out.at(-1);
    if (last !== undefined && last.tag === tag) last.text += value;
    else out.push(tag === undefined ? { text: value } : { text: value, tag });
  };
  const go = (current: Doc, indent: number, flat: boolean, tag?: string): void => {
    switch (current.kind) {
      case "text":
        push(current.text, tag);
        column += current.text.length;
        return;
      case "line":
        if (flat && current.flat !== "\n") {
          push(current.flat, tag);
          column += current.flat.length;
        } else {
          // Line breaks and indentation are structure, not tokens: leave them untagged.
          push(`\n${" ".repeat(indent)}`);
          column = indent;
        }
        return;
      case "concat":
        for (const item of current.items) go(item, indent, flat, tag);
        return;
      case "nest":
        go(current.doc, indent + current.indent, flat, tag);
        return;
      case "group":
        go(current.doc, indent, flat || flatWidth(current.doc) <= maxWidth - column, tag);
        return;
      case "annotate":
        go(current.doc, indent, flat, current.tag);
        return;
    }
  };
  go(doc, 0, false);
  return out;
}

/** Lays out `doc` against `maxWidth` columns as plain text. */
export function render(doc: Doc, maxWidth: number): string {
  return renderSegments(doc, maxWidth).map((segment) => segment.text).join("");
}
