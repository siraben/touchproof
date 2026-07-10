# TouchProof

TouchProof is a visual-first equational notebook for learning functional
programming and theorem proving. It is a fork of
[Wyrm Math](https://github.com/dicroce/wyrm_math) and carries its central UI
invariant into proofs:

> Legal moves are possible; illegal moves are impossible.

The default interface is a direct-manipulation proof canvas. Tap a reducible
function call, drag a value into case analysis, or drag a local equality onto
a matching expression. A synchronized notebook view records the same proof as
readable equations. Every committed step is validated by a small dependent
type kernel.

The learning path begins with concrete Boolean and Nat evaluation, then
introduces Boolean elimination, induction on naturals, and a sequence of list
laws. Its capstone proves map composition:

```text
map (f ∘ g) l = map f (map g l)
```

It introduces induction only when evaluation becomes stuck on the unknown
list. The user then solves the `[]` and `x :: xs` obligations locally and uses
the induction hypothesis as a draggable rewrite rule.

## Run it

```sh
nix develop
corepack pnpm install
corepack pnpm build
corepack pnpm dev
```

Open the URL printed by Next.js. Port 3000 is used when available.

## Check everything

```sh
nix develop --command zsh -lc '
  corepack pnpm typecheck &&
  corepack pnpm test &&
  corepack pnpm build &&
  corepack pnpm --dir apps/web typecheck &&
  corepack pnpm --dir apps/web test &&
  corepack pnpm --dir apps/web build
'
```

## Repository

- `src/kernel`: the trusted dependent kernel—universes, Π-types, equality,
  substitution, normalization, and bidirectional checking.
- `src/proof`: equational proof sessions, legal-move enumeration, local
  obligations, and the kernel-checked map-composition certificate.
- `apps/web`: Next.js visual editor, notebook view, TypeScript proof API, and
  local proof-document persistence.
- `docs/WYRM_ARCHITECTURE.md`: the original Wyrm Math architecture retained
  as design provenance.
- `docs/CURRICULUM.md`: the Software Foundations-inspired lesson sequence and
  the capability exercised by every theorem.

TouchProof is MIT licensed. The upstream copyright and full Git history are
preserved.
