import { describe, expect, it } from "vitest";
import {
  app,
  applicationSpine,
  apps,
  constant,
  equal,
  lambda,
  refl,
  termToString,
  variable,
} from "../../src/kernel/term.js";
import { checkProofSession } from "../../src/proof/certificate.js";
import { fill, group, nest, render, text } from "../../src/proof/doc.js";
import { applyProofMove, createLessonSession, enumerateProofMoves, type ProofSession } from "../../src/proof/session.js";

const c = constant;
const v = variable;

describe("curried application printing", () => {
  it("splits left-nested applications into head and spine", () => {
    const term = apps(c("map"), v("f"), v("xs"));
    const { head, args } = applicationSpine(term);
    expect(head).toEqual(c("map"));
    expect(args).toEqual([v("f"), v("xs")]);
  });

  it.each([
    [apps(c("map"), v("f"), apps(c("append"), c("nil"), v("ys"))), "map f (append nil ys)"],
    [apps(c("eq_trans"), c("List"), apps(c("map"), v("f"), c("nil")), v("x"), v("y")), "eq_trans List (map f nil) x y"],
    [app(lambda("x", c("Elem"), v("x")), c("element")), "(λ x : Elem, x) element"],
    [refl(apps(c("add"), v("n"), c("zero"))), "refl (add n zero)"],
    [apps(c("f"), equal(c("Nat"), v("n"), v("m"))), "f (n = m)"],
    [app(app(v("f"), v("x")), v("y")), "f x y"],
  ])("prints flattened spines with only compound arguments parenthesized", (term, expected) => {
    expect(termToString(term)).toBe(expected);
  });

  it("fill packs items per line, breaking only before an item that does not fit", () => {
    const items = ["alpha", "beta", "gamma", "delta-longer-item", "eps", "zeta"].map(text);
    const doc = group(nest(2, fill(items)));
    // Not all-or-nothing: alpha/beta/gamma pack, the long item wraps, and the
    // trailing short items pack again on the continuation line.
    expect(render(doc, 20)).toBe("alpha beta gamma\n  delta-longer-item\n  eps zeta");
    // Flat output is the plain space-joined spine, unchanged by fill.
    expect(render(doc, 120)).toBe("alpha beta gamma delta-longer-item eps zeta");
  });

  it("renders certificate scripts with curried, fill-packed spines", () => {
    let session: ProofSession = createLessonSession("map-composition");
    session = applyProofMove(session, "induction:l");
    for (let step = 0; step < 40 && session.goals.some((goal) => goal.status === "open"); step += 1) {
      const moves = enumerateProofMoves(session);
      const move = moves.find((candidate) => candidate.kind === "close")
        ?? moves.find((candidate) => candidate.kind === "reduce")
        ?? moves.find((candidate) => candidate.kind === "rewrite");
      if (move === undefined) throw new Error("stuck");
      session = applyProofMove(session, move.id);
    }
    const certificate = checkProofSession(session);
    // Curried, not pair-nested: the statement head reads like Gallina.
    expect(certificate.script).toContain("map (compose f g)");
    expect(certificate.script).not.toContain("((map f)");
    // Fill density: several spine arguments share the head's line instead of
    // one argument per line.
    expect(certificate.script).toContain("eq_trans List (map (compose f g) l) (map (compose f g) l)");
  });
});
