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
| 9 | `revAcc xs acc = rev xs ++ acc` | Generalizing an accumulator before induction | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 10 | `map (f ∘ g) xs = map f (map g xs)` | Higher-order functions and local rewriting | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |
| 11 | `n + S m = S (n + m)` | Induction on the left argument | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 12 | `(a + b) + c = a + (b + c)` | Nested data reached by a single induction | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 13 | `a + b = b + a` | Composing two proved lemmas per branch | [Induction](https://softwarefoundations.cis.upenn.edu/current/lf-current/Induction.html) |
| 14 | `length (xs ++ ys) = length xs + length ys` | A list measure meeting addition | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 15 | `length (rev xs) = length xs` | Reusing a measure lemma and an arithmetic bridge | [Lists](https://softwarefoundations.cis.upenn.edu/current/lf-current/Lists.html) |
| 16 | `length (map f xs) = length xs` | Higher-order functions preserve a measure | [Poly](https://softwarefoundations.cis.upenn.edu/current/lf-current/Poly.html) |

The important transition is visible in the interface: concrete values reduce;
unknown finite values require cases; unknown recursive values require
induction; and larger proofs rely on earlier theorems as draggable rewrite
cards. Each completed lesson assembles its visible derivation into the exact
closed proof term checked by the kernel.

Planned definition-building exercises draw from `nandb`, `andb3`, `hd_error`,
and fold/map exercises. They require the user-definition editor and checked
termination/coverage machinery before they can be offered honestly.
