# TouchProof architecture

## Product invariant

The UI never invents proof actions. It asks `enumerateProofMoves` for the legal
moves at the current goal and renders those values as contextual popovers,
drags, drop targets, and accessible buttons. `applyProofMove` enumerates again,
so stale or forged identifiers fail without changing the document.

Lessons contain theorem statements, visible definitions, inductive declarations,
and previously proved lemmas. They do not contain tactic scripts. Case analysis,
induction, generalization, reduction, rewriting, and reflexivity are generated
from the same generic engine used for user-authored documents.

## Trusted dependent kernel

`src/kernel/term.ts` defines the core calculus:

- predicative `Type u` universes;
- dependent `Π` types, annotated lambdas, application, and local `let` terms;
- intensional equality, reflexivity, and equality elimination;
- generic recursor terms for registered inductive types.

`src/kernel/checker.ts` owns capture-avoiding substitution, alpha-safe
conversion, beta/delta/iota reduction, inference, checking, declaration
validation, and inductive positivity. Inductive declarations are append-only.
Datatype parameters are explicit and checked before constructor fields.
Constructor fields cannot escape the datatype's universe or contain a recursive
occurrence outside a direct strictly-positive field. Recursor motives and every
constructor branch are checked before elimination is accepted. Conversion
implements beta, delta, iota, and zeta reduction.

The standard environment is constructed only through these checking paths.
Programs such as negation, addition, append, map, reverse, and accumulator
reverse are lambda terms over recursors. Their equations reduce by conversion.
Equality combinators and reusable list theorems are ordinary checked proof terms.
An inventory test ensures every global declaration is either generated
inductive metadata or has a checked value.

## Exact visual certificates

The canvas AST is parsed into kernel terms by `src/proof/certificate.ts`.
Definition reductions must pass definitional equality. A rewrite constructs
congruence for the exact selected expression context and applies the chosen
local equality. Case and induction branches are assembled into the registered
datatype recursor. Generalized variables become `Π` binders in the motive and
in recursive hypotheses.

A completed proof is certified only after the exact assembled term checks from
an empty local context against the immutable lesson theorem. There is no
separate hard-coded certificate for a lesson and no status bit is trusted when
a saved document is restored.

## Scope and interaction

Every context variable occurring in a goal is a selectable expression. Its type
determines its structural actions: finite datatypes offer cases, recursive
datatypes additionally offer induction, and local variables offer
generalization. Generalized binders are displayed as nested shaded boxes around
their scope. A generalized induction hypothesis is matched by typed pattern
instantiation, so it can be applied at a different accumulator or parameter.

Definition and inductive cards are rendered from the same executable registries
used by reduction and move generation. The visual, notebook, and proof-term
views therefore cannot drift into separate proof representations.

## Browser boundary

The backend recursively decodes imported JSON, restores immutable theorem
metadata, replays legal transitions, checks the candidate term, and only then
returns a new snapshot. Documents live in local storage and can be imported or
exported. Undo and redo retain snapshots checked by the same in-browser kernel.
No proof source, local context, or document is sent to the hosting Worker.

## Soundness rules

1. UI affordances come only from generic move enumeration.
2. Applying a move repeats legality checking.
3. Every expression and local hypothesis is type-checked.
4. Reduction closes only by kernel conversion.
5. Rewriting constructs equality-elimination evidence for the selected context.
6. Case analysis and induction construct an exhaustive checked recursor.
7. Completion requires one closed proof term for the original theorem.
8. The shipped environment contains no unchecked axioms.
9. Malformed, oversized, stale, or unknown serialized data is rejected.
