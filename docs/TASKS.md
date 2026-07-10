# TouchProof task tracker

## Completed foundation

- [x] Create `siraben/touchproof` as a GitHub fork with upstream history.
- [x] Add a pinned `nix develop` environment and pnpm workspace.
- [x] Add the dependent kernel with universes, Π-types, equality, substitution,
      normalization, and independent term checking.
- [x] Produce and check the induction proof term for map composition.
- [x] Model induction branches as local proof obligations.
- [x] Enumerate legal reduction, rewrite, induction, and reflexivity moves.
- [x] Reject proof actions that were not enumerated.
- [x] Build the visual-first Next.js editor and synchronized notebook view.
- [x] Support dragging `l` into induction and dragging `IH` onto a matching term.
- [x] Add keyboard/button equivalents for proof gestures.
- [x] Add local persistence plus validated JSON import/export.
- [x] Test the complete map-composition flow through the TypeScript API.
- [x] Add the Software Foundations-inspired ramp through Boolean computation,
      Boolean elimination, Nat computation and induction, append, map/append,
      reverse/append, reverse involution, and map composition.

## Kernel expansion

- [ ] Add checked strictly-positive user-defined inductive families.
- [ ] Generate recursors and computation rules instead of bootstrapping the
      initial List standard library as trusted declarations.
- [ ] Add structural-termination checking for user-defined recursive functions.
- [ ] Add dependent pairs and checked pattern-match coverage.
- [ ] Add universe constraints and cumulative conversion beyond the initial
      concrete hierarchy.

## Notebook expansion

- [ ] Add a versioned document schema and migrations.
- [ ] Add visual editors for data and function definitions.
- [ ] Add reverse rewriting, congruence selection, cases, constructor, and
      hypothesis-introduction gestures.
- [ ] Add undo/redo over the append-only derivation tree.
- [ ] Add definition-building exercises for `nandb`, `andb3`, `hd_error`, and
      user-authored recursive functions.
- [ ] Add browser-level drag/drop and accessibility tests when a browser runner
      is available in CI.
