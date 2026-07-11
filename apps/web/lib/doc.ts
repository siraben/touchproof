/**
 * Wadler-style pretty-printing combinators, re-exported from @touchproof/core
 * so the kernel's proof-script layout and the web definition cards share one
 * implementation (including the annotated segment renderer used for syntax
 * highlighting).
 */

export { annotate, cat, group, hardline, line, nest, render, renderSegments, softline, text } from "@touchproof/core";
export type { Doc, Segment } from "@touchproof/core";
