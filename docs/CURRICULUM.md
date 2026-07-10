# Curriculum

TouchProof's first learning path is adapted from the progression in Software
Foundations Volume 1, *Logical Foundations*. The wording, interactions, and
proofs here are original to TouchProof; the source chapters supply the
pedagogical ordering and exercise inspiration.

| # | TouchProof lesson | What the engine exercises | Inspiration |
|---|---|---|---|
| 1 | `negb false = true` | Concrete reduction and reflexivity | [Basics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html) |
| 2 | `negb (negb b) = b` | Boolean elimination and two local cases | [Basics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html) |
| 3 | `2 + 1 = 3` | Recursive Nat computation | [Basics](https://softwarefoundations.cis.upenn.edu/current/lf-current/Basics.html) |
| 4 | `n + 0 = n` | Structural induction on Nat and congruence | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 5 | `xs ++ [] = xs` | Structural induction on List | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 6 | `map f (xs ++ ys) = map f xs ++ map f ys` | An invariant with fixed parameters | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |
| 7 | `rev (xs ++ ys) = rev ys ++ rev xs` | Induction plus a reusable associativity lemma | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 8 | `rev (rev xs) = xs` | Reusing the previously proved reverse/append theorem | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 9 | `map (f ∘ g) xs = map f (map g xs)` | Higher-order functions and local rewriting | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |

The important transition is visible in the interface: concrete values reduce;
unknown finite values require cases; unknown recursive values require
induction; and larger proofs rely on earlier theorems as draggable rewrite
cards. Each completed lesson has a separate proof term checked by the kernel.

Planned definition-building exercises draw from `nandb`, `andb3`, `hd_error`,
and fold/map exercises. They require the user-definition editor and checked
termination/coverage machinery before they can be offered honestly.
