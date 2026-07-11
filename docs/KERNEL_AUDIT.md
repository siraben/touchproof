# TouchProof kernel audit — 2026-07-10

Independent audit of the trusted computing base (`src/kernel/term.ts`,
`src/kernel/checker.ts`, `src/proof/certificate.ts`,
`src/proof/standardLibrary.ts`, and the surrounding proof layer), including
external research on kernel representation and conversion-checking
techniques.

## Bottom line

No soundness hole was found. The kernel is, to this analysis, sound for the
small monomorphic type theory it implements, and the certificate pipeline
correctly reduces trust to one independent kernel `check` of an assembled
term against a lesson-pinned type in an axiom-free environment.

## The type theory implemented

- **Universes:** predicative, non-cumulative `Type n` hierarchy;
  `infer(Type n) = Type (n+1)` — no `Type : Type`. Pi takes
  `max(domainLevel, codomainLevel)`. One shallow sort-subsumption
  (`Type i ≤ Type j` at the top of checking only) — sound, mildly
  incomplete.
- **Pi / lambda / application:** standard dependent function typing, β via
  substitution in `normalize`, plus `let`/ζ-reduction.
- **Equality:** homogeneous `eq A x y` with `refl` and a Paulin-Mohring
  `subst` (transport) eliminator; no full `J`, no `K`/UIP. Leibniz
  equality — consistent.
- **Inductives:** non-indexed, optionally parameterized. Strict positivity
  enforced by the strongest possible rule (a field may mention the type
  being defined only as exactly the applied inductive) — over-restrictive
  but safe.
- **Recursor:** fully dependent motive `∀ (x : I), Type`; per-constructor
  cases carry induction hypotheses for recursive fields; binder order in
  `infer` matches the ι-reduction application order (verified). Large
  elimination permitted — sound for these small types.
- **Definitional equality:** normalize-and-compare (full normalization,
  then α-equality with de-Bruijn-leveled bound variables). No η. Eager
  δ-unfolding.

## Why the kernel is believed sound

- **Substitution is genuinely capture-avoiding** — binders whose names
  occur free in the replacement are freshened against the union of free
  variables; the classic adversarial cases trace correctly and shadowing
  short-circuits.
- **Every standard-library constant is proved, not an axiom** —
  `touchProofEnvironment` introduces every lemma through the checking
  entry points and never `declareAxiom`; `checkProofSession` calls
  `assertAxiomFree`; a test mechanically asserts axiom-freedom.
- **Environment forging is blocked** — declarations carrying
  inductive/constructor metadata are rejected, and the branded
  `CheckedEnvironment` class defeats forged maps.
- **The final trust step is kernel-independent** — `checkProofSession`
  ends in `check(theorem.term, theorem.type, {}, env)`; a false theorem
  cannot be certified regardless of what the session/move layer does.
- **The theorem statement is pinned to the lesson** — attacker-supplied
  statements in imported documents are decoded and then discarded in favor
  of `createLessonSession(lessonId)`; each visible transition is
  re-derived and must be a real definitional reduction or template
  rewrite.

Ω/self-application is untypeable, non-positive inductives are rejected,
`refl` cannot bridge unequal terms, and there is no η to exploit. No
witness of `False` was constructible.

## Findings, ranked

### F1 — MEDIUM (fidelity, not unsoundness): the kernel certifies a monomorphic shadow of the displayed polymorphic theorem

`valueType` in `certificate.ts` collapses the type language (`List A` → the
monomorphic kernel `List`, arrow types → `Elem → Elem`, `A : Type` binders
silently dropped). For `map f (xs ++ ys) = map f xs ++ map f ys` the term
actually checked is the `Elem`-instance, not the polymorphic statement.
The proved statement is true — no inconsistency — but the generality shown
to the user (parametricity over `A, B, C`) is asserted, never proven. This
affects every List/higher-order lesson.

### F2 — LOW (robustness/DoS): no fuel/step limit in `normalize`

Full normalization with no step counter and non-tail recursion everywhere;
on the intended inputs it terminates, but a malformed assembly would hang
or overflow the stack rather than erroring.

### F3 — LOW (incompleteness only)

Over-restrictive positivity (no rose trees), no η, shallow cumulativity —
each rejects valid terms, never accepts invalid ones.

### F4 — LOW (layering): the certificate is not independently replayable

The certificate checker imports the session/move engine to rebuild trusted
goal templates. The final gate is independent, but a minimal,
self-contained certificate would satisfy the de Bruijn criterion more
cleanly.

### Structural positives

Parsing/elaboration lives entirely outside the kernel; the kernel is a
~740-line checker over core terms with no session/UI concepts leaking in;
the boundary test enforces DOM-freedom.

## Performance and representation research

Today: named variables, naive substitution-based full normalization +
α-compare. Cost profile: each substitution recomputes free-variable sets
(`O(size)` per step, `O(size²)` normalizations); `definitionallyEqual`
fully normalizes both sides with no WHNF short-circuit, no
reference-identity fast path, eager δ-unfolding. Certificate terms carry
`eq_trans`/`congr_arg` endpoint annotations of size `Θ(n·s)`; the
map-composition and length-rev certificates are already near the readable
limit.

Best practice mapped to this codebase (citations at bottom):

- **Normalization by Evaluation** with closure-based semantic values and
  environment passing; **glued evaluation** to control definitional
  unfolding (smalltt).
- **Lazy WHNF + spine congruence** conversion instead of
  normalize-and-compare (Lean 4 kernel style): reduce to weak head form,
  try congruence on same-head spines first, unfold only on failure.
- **de Bruijn indices for terms + levels for values** (or locally
  nameless) to eliminate named freshening.
- **Sharing:** hash-consing, WHNF caching, reference-identity fast path.
- **TS-specific:** monomorphic object shapes for the `Term` union,
  iterative (worklist) normalization to bound stack depth.

None of this changes what is trusted — only how conversion is decided.

## Prioritized recommendations

1. **R1 — Close the polymorphism fidelity gap (F1).** Either make
   `List`/lemmas genuinely parameterized (machinery exists in
   `declareParameterizedInductive`) and thread real type binders through
   `binders()`/`valueType()`, or label the certificate as the
   `Elem`-instance in the UI. Tests: assert `theoremType` for
   `list-map-append` binds `A, B : Type` (or pin the honest UI copy).
2. **R2 — Normalization fuel + iterative traversal (F2).** Step budget
   throwing `KernelError`; worklists for the hottest recursions. Tests: a
   divergent hand-built term must throw, a deep `succ` tower must not
   overflow.
3. **R3 — Self-contained, replayable certificates (F4).** Emit
   `{term, type, environment fingerprint}` and provide a standalone
   `replay(certificate)` that only calls `check`. Test: replay with the
   session layer excluded from the import graph.
4. **R4 — Lazy WHNF + spine congruence, then NbE (performance).** Do after
   R1–R3; highest regression risk, pure optimization. Tests: differential
   old-vs-new normalizer property test; benchmark guard on the largest
   certificates.
5. **R5 — Adversarial test gaps.** Add: substitution-result capture test;
   wrong-motive recursor rejection; ι-order regression on a
   two-recursive-field inductive; subtle non-positive inductive
   (`c : (Nat → Bad) → Bad`); ill-formed/oversized certificate bounds;
   `Type`-in-`Type` attempt.

## Sources

- smalltt (Kovács): https://github.com/AndrasKovacs/smalltt
- PLS-Lab, Normalization by Evaluation:
  https://www.pls-lab.org/en/Normalization_by_Evaluation
- Christiansen, Checking Dependent Types with NbE:
  https://davidchristiansen.dk/tutorials/nbe/
- Type Checking in Lean 4 — Definitional Equality:
  https://ammkrn.github.io/type_checking_in_lean4/type_checking/definitional_equality.html
- Type Checking in Lean 4 — What's a Kernel:
  https://ammkrn.github.io/type_checking_in_lean4/whats_a_kernel.html
- Syntax- vs Type-Directed NbE comparison: https://arxiv.org/html/2509.13489v1
