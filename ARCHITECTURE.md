# TouchProof architecture

## Product invariant

The UI never constructs an arbitrary proof action. It asks the engine for
legal `ProofMove` values and renders those values as taps, drags, drop targets,
and accessible buttons. `applyProofMove` enumerates again before applying an
action, so a stale or forged move identifier is rejected.

A proof move contains a stable handle id and, for drag operations, a stable
drop-target id. Untouched expression nodes retain their ids across rewrites.
This is the same interaction contract that makes Wyrm Math manipulable rather
than form-like; see `docs/WYRM_ARCHITECTURE.md` for the upstream design.

## Trusted kernel

`src/kernel` is intentionally independent from React, Next.js, proof-session
state, and gesture code. Its term language currently contains:

- predicative universes;
- dependent function types and annotated lambdas;
- application and global declarations;
- intensional equality, reflexivity, and equality substitution.

The checker performs capture-avoiding substitution, beta/delta reduction,
normalization, alpha-aware definitional equality, inference, and checking.
The standard-library environment supplies the types and induction principles
for the initial `List` lesson. The completed visual derivation is backed by an
explicit induction proof term that the kernel checks independently.

The current trusted boundary includes those standard-library declarations.
Moving list declarations behind checked strictly-positive inductive
elaboration is the next kernel milestone; it is tracked explicitly rather
than implied to be complete.

## Proof sessions

A `ProofSession` contains a theorem statement, local equality obligations,
the focused obligation, a derivation transcript, and kernel status. Branching
is represented as sibling obligations. Completing one focuses the next; the
parent theorem becomes checked only after every obligation is solved and the
complete proof term passes the kernel.

Move enumeration currently offers:

- case analysis or structural induction from datatype constructors;
- one-step reduction through any matching definition clause;
- occurrence-specific rewriting with the local induction hypothesis;
- closure by reflexivity.

Reduction and rewriting preserve ids outside the selected occurrence. The
notebook view reads the same proof-session state as the visual view, so there
is no second proof representation to synchronize.

The interactive language is not implemented as one reducer per lesson.
`src/proof/ast.ts` owns the shared parsed expression tree,
`src/proof/definitions.ts` stores pattern-matching equations, and the generic
reducer matches calls against those clauses. Move names and explanations come
from the clause that matched. `src/proof/inductives.ts` likewise drives cases
and recursive induction hypotheses from datatype metadata. Lesson specs contain
starting goals and available prior lemmas, never a prescribed solution path.

Canvas definition cards and the script view are printed from these same AST,
definition, and inductive registries. They are executable declarations rather
than duplicated explanatory text.

## Web boundary

The Next.js route is the TypeScript backend for proof actions. The browser
sends its current session and a move or focus id. The backend bounds document
size, validates the session shape, re-enumerates legality, applies the move,
and returns the next state plus its legal moves.

Documents are stored locally and can be imported or exported as JSON. Imported
documents are sent through the backend before becoming active. A later schema
milestone will add explicit format versions and migrations.

## Soundness rules

1. UI affordances come only from `enumerateProofMoves`.
2. Applying a move repeats legality checking.
3. Reflexivity is offered only for structurally equal program expressions.
4. A complete visual proof is not marked checked until its kernel proof term
   checks against the theorem type.
5. Automation may generate proof terms but never extend the kernel.
6. Malformed, oversized, stale, or unknown proof actions fail without changing
   the session.
