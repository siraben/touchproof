import { describe, expect, it } from "vitest";
import { checkProofSession } from "../../src/proof/certificate.js";
import { termToString, type Term } from "../../src/kernel/term.js";
import { applyProofMove, createLessonSession, enumerateProofMoves, lessonCatalog, type EquationGoal, type ProofSession } from "../../src/proof/session.js";

/** The chain of `Π` binders at the head of a term, as (name, printed-type) pairs, plus the remaining body. */
function piBinders(term: Term): { readonly binders: readonly (readonly [string, string])[]; readonly body: Term } {
  const binders: (readonly [string, string])[] = [];
  let current = term;
  while (current.kind === "pi") {
    binders.push([current.param, termToString(current.domain)]);
    current = current.codomain;
  }
  return { binders, body: current };
}

function finish(lessonId: string): ProofSession {
  let session = createLessonSession(lessonId);
  if (lessonId === "list-rev-acc") session = applyProofMove(session, "generalize:acc");
  for (let count = 0; count < 100 && session.goals.some((goal) => goal.status === "open"); count += 1) {
    const moves = enumerateProofMoves(session);
    // Analyses are state-derived and available in every goal now; this driver
    // only takes them on the root goal, as the curriculum walkthroughs do.
    const analysis = session.focusedGoalId === "goal-root"
      ? moves.find((candidate) => candidate.kind === "induction") ?? moves.find((candidate) => candidate.kind === "cases")
      : undefined;
    const move = analysis
      ?? moves.find((candidate) => candidate.kind === "reduce")
      ?? moves.find((candidate) => candidate.kind === "rewrite")
      ?? moves.find((candidate) => candidate.kind === "close")
      // The propositional lessons: assume, take conjunctions apart, split
      // conjunction goals, and close obligations with matching hypotheses.
      ?? moves.find((candidate) => candidate.kind === "intro")
      ?? moves.find((candidate) => candidate.kind === "destruct")
      ?? moves.find((candidate) => candidate.kind === "split")
      ?? moves.find((candidate) => candidate.kind === "exact");
    if (move === undefined) throw new Error(`${lessonId} became stuck`);
    session = applyProofMove(session, move.id);
  }
  return session;
}

describe("exact visual proof certificates", () => {
  it.each(lessonCatalog.map((lesson) => [lesson.id] as const))("assembles and checks the exact %s derivation", (lessonId) => {
    const certificate = checkProofSession(finish(lessonId));
    expect(certificate.theoremTerm).toBeDefined();
    expect(certificate.theoremType).toBeDefined();
    expect(certificate.script).not.toContain("sorry");
  });

  it("proves the polymorphic map-composition statement, not its Elem instance", () => {
    const certificate = checkProofSession(finish("map-composition"));
    const type = certificate.theoremType!;
    // It quantifies its three source-level element types explicitly.
    const { binders, body } = piBinders(type);
    expect(binders).toEqual([
      ["A", "Type 0"],
      ["B", "Type 0"],
      ["C", "Type 0"],
      ["f", "(Π _ : B, C)"],
      ["g", "(Π _ : A, B)"],
      ["l", "List A"],
    ]);
    // The body uses applied polymorphic List/map/compose — never a bare `Elem`.
    expect(termToString(body)).toBe("(map A C (compose A B C f g) l = map B C f (map A B g l))");
    expect(termToString(type)).not.toContain("Elem");
  });

  it("binds the element types of list-map-append and applies List/map, never Elem", () => {
    const type = checkProofSession(finish("list-map-append")).theoremType!;
    const { binders, body } = piBinders(type);
    expect(binders).toEqual([
      ["A", "Type 0"],
      ["B", "Type 0"],
      ["f", "(Π _ : A, B)"],
      ["xs", "List A"],
      ["ys", "List A"],
    ]);
    expect(termToString(body)).toBe("(map A B f (append A xs ys) = append B (map A B f xs) (map A B f ys))");
    expect(termToString(type)).not.toContain("Elem");
  });

  it("keeps the monomorphic lessons monomorphic (no spurious type binders)", () => {
    const type = checkProofSession(finish("nat-add-zero")).theoremType!;
    expect(piBinders(type).binders).toEqual([["n", "Nat"]]);
    expect(termToString(type)).toBe("(Π n : Nat, (add n zero = n))");
  });

  it("rejects a mutated visible transition", () => {
    const completed = finish("bool-compute");
    const forged = structuredClone(completed);
    const goal = forged.goals[0] as EquationGoal;
    const step = goal.steps[1]!;
    (step.right as { name: string }).name = "false";
    expect(() => checkProofSession(forged)).toThrow();
  });
});
