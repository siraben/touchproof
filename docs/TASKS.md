# TouchProof tasks

## Working system

- [x] Visual canvas, contextual point popovers, drag-and-drop rewrites, and
      notebook/proof-term views.
- [x] Generic reductions generated from parsed definition clauses.
- [x] Generic case analysis and induction generated from datatype constructors.
- [x] Generic variable generalization with visibly nested binder scopes.
- [x] An accumulator-reverse lesson that requires a generalized induction
      hypothesis.
- [x] Predicative dependent kernel with universes, `Π`, lambda, application,
      equality, equality elimination, inductive declarations, recursors, and
      beta/delta/iota conversion.
- [x] Strict positivity, universe, duplicate declaration, malformed recursor,
      and alpha-capture rejection tests.
- [x] Checked definitions and theorem declarations with a zero-axiom standard
      environment inventory.
- [x] Exact proof-term assembly from every visible transition and end-to-end
      checking for every lesson.
- [x] Browser-local persistence, import/export, undo/redo, strict decoding,
      linting, and static deployment.

## Next core extensions

- [ ] Universe-polymorphic datatype parameters rather than the curriculum's
      erased element universe.
- [ ] Indexed inductive families and dependent pattern matching.
- [ ] Surface elaboration with implicit arguments, metavariables, and typed
      holes for free-form theorem authoring.
- [ ] A canvas editor for adding datatype and recursive function declarations
      through the existing checked declaration APIs.
- [ ] Sharing reusable checked libraries between local documents.
