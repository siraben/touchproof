# TouchProof

TouchProof is a visual-first dependent theorem prover for learning functional
programming and equational reasoning. It is a fork of
[Wyrm Math](https://github.com/dicroce/wyrm_math) and keeps its central UI
invariant:

> Legal moves are possible; illegal moves are impossible.

The default interface is an open proof canvas. Click any expression to see the
actions justified by its type and local context, drag equality hypotheses onto
matching occurrences, click `=` for reflexivity, and move definition cards
beside the goal while you work. The notebook and proof-term views are two views
of the same document.

Lessons are ordinary goals over the generic engine. They begin with Boolean and
natural-number computation, then introduce case analysis, induction, rewriting,
list theorems, higher-order functions, and generalizing an induction hypothesis.
The accumulator lesson makes the scope change visible: generalizing a variable
draws a shaded binder region and produces an induction hypothesis quantified
over that variable.

## Trusted core

Every action is checked locally by TouchProof's small TypeScript dependent type
theory kernel. Its core terms include predicative universes, dependent function
types, lambdas, application, equality, reflexivity, equality elimination, and
strictly-positive inductive recursors. Boolean, natural-number, and list
functions compile to recursors; their computation laws are definitional.
Symmetry, transitivity, congruence, induction principles, and prerequisite list
theorems are stored as checked terms rather than assumptions.

Each visible reduction or rewrite contributes evidence to one exact proof term.
When every local obligation closes, that assembled closed term is checked again
against the original theorem. The shipped standard environment contains no
unchecked axioms.

## Run and check

```sh
nix develop
corepack pnpm install
corepack pnpm dev
```

```sh
nix develop --command zsh -lc 'corepack pnpm check'
```

The application has no proof server and no external compiler payload. Proof
checking runs synchronously in the browser and the production build is an
ordinary static Next.js export.

## Repository

- `src/kernel`: core terms, conversion, bidirectional checking, append-only
  declarations, positivity checking, inductive recursors, and reduction.
- `src/proof`: the typed program language, generic legal-move enumeration,
  lessons, serialized proof documents, and exact proof-term assembly.
- `apps/web`: canvas, contextual popovers, drag-and-drop rewrites, visible scope
  regions, notebook/proof-term views, persistence, and undo/redo.
- `test/kernel`: kernel rejection tests and end-to-end certificates for every
  lesson.
- `docs/CURRICULUM.md`: the learning sequence and the capability exercised by
  each theorem.

TouchProof is hosted at <https://touchproof.siraben.dev>. It is MIT licensed;
the upstream copyright and repository history are preserved.
