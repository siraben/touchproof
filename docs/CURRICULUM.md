# Curriculum

TouchProof's first learning path is adapted from the progression in Software
Foundations Volume 1, *Logical Foundations*. The wording, interactions, and
proofs here are original to TouchProof; the source chapters supply the
pedagogical ordering and exercise inspiration.

| # | TouchProof lesson | What the engine exercises | Inspiration |
|---|---|---|---|
| 1 | `P → P` | Introducing and using a hypothesis (intro, exact) | [Tactics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Tactics.html) |
| 2 | `P ∧ Q → P` | Destructing a conjunction hypothesis | [Logic](https://softwarefoundations.cis.upenn.edu/current/lf-current/Logic.html) |
| 3 | `P → Q → P` | Nested intros and choosing the right hypothesis | [Tactics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Tactics.html) |
| 4 | `P ∧ Q → Q ∧ P` | Intro, destruct, split, exact — the propositional capstone | [Logic](https://softwarefoundations.cis.upenn.edu/current/lf-current/Logic.html) |
| 5 | `negb false = true` | Concrete reduction and reflexivity | [Basics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html) |
| 6 | `negb (negb b) = b` | Boolean elimination and two local cases | [Basics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html) |
| 7 | `2 + 1 = 3` | Recursive Nat computation | [Basics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html) |
| 8 | `n + 0 = n` | Structural induction on Nat and congruence | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 9 | `xs ++ [] = xs` | Structural induction on List | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 10 | `map f (xs ++ ys) = map f xs ++ map f ys` | An invariant with fixed parameters | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |
| 11 | `rev (xs ++ ys) = rev ys ++ rev xs` | Induction plus a reusable associativity lemma | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 12 | `rev (rev xs) = xs` | Reusing the previously proved reverse/append theorem | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 13 | `revAcc xs acc = rev xs ++ acc` | Generalizing an accumulator before induction | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 14 | `map (f ∘ g) xs = map f (map g xs)` | Higher-order functions and local rewriting | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |
| 15 | `n + S m = S (n + m)` | Induction on the left argument | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 16 | `(a + b) + c = a + (b + c)` | Nested data reached by a single induction | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 17 | `a + b = b + a` | Composing two proved lemmas per branch | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 18 | `length (xs ++ ys) = length xs + length ys` | A list measure meeting addition | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 19 | `length (rev xs) = length xs` | Reusing a measure lemma and an arithmetic bridge | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 20 | `length (map f xs) = length xs` | Higher-order functions preserve a measure | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |

The curriculum now opens with four propositional lessons before any equation
appears. Their goals are propositions rather than equations: atoms are
context variables displayed as `P : Prop`, implication is the kernel's Π, and
conjunction is the parameterized inductive `and` with the single constructor
`conj`. `Prop` is a display name only — the kernel is predicative and checks
these atoms at `Type 0`; there is no impredicative sort and no axiom. The
moves are the classic Coq quartet: **intro** (assume the antecedent), **exact**
(a hypothesis is precisely the goal), **destruct** (replace `H : A ∧ B` by one
hypothesis per side — a single-branch analysis of the goal tree), and
**split** (prove each side of a conjunction goal separately). Completed
propositional proofs assemble into plain λ-terms (`λ P, λ h, h`;
`and.rec`/`conj` for the conjunction lessons) checked by the same kernel.

The important transition is visible in the interface: concrete values reduce;
unknown finite values require cases; unknown recursive values require
induction; and larger proofs rely on earlier theorems as draggable rewrite
cards. Each completed lesson assembles its visible derivation into the exact
closed proof term checked by the kernel.

Generalization (lesson 13) is complemented by its inverse move: **introduce**
pops the outermost ∀-binder of a generalized goal back into the context, so
generalize and intro can be explored and undone freely before committing to
an induction.

Planned definition-building exercises draw from `nandb`, `andb3`, `hd_error`,
and fold/map exercises. They require the user-definition editor and checked
termination/coverage machinery before they can be offered honestly.
