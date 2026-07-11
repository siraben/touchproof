import { check, checkDeclaration, declareInductive, declareParameterizedInductive, emptyEnvironment, type DefinitionInput, type Environment } from "../kernel/checker.js";
import {
  app,
  apps,
  arrow,
  constant,
  equal,
  lambda,
  pi,
  recursor,
  refl,
  subst,
  type,
  variable,
  type Term,
} from "../kernel/term.js";

const c = constant;
const v = variable;

function pis(bindings: readonly (readonly [string, Term])[], result: Term): Term {
  return bindings.reduceRight((body, [name, domain]) => pi(name, domain, body), result);
}

function lambdas(bindings: readonly (readonly [string, Term])[], body: Term): Term {
  return bindings.reduceRight((result, [name, domain]) => lambda(name, domain, result), body);
}

// ---------------------------------------------------------------------------
// Polymorphic List primitives. `List : Type → Type`; every constructor and
// list function takes its element type(s) as leading arguments, exactly as an
// explicit (non-inferring) dependent kernel requires.
// ---------------------------------------------------------------------------

/** `List A` for a kernel element type A. */
export const listType = (a: Term): Term => app(c("List"), a);
/** `nil : Π A, List A` applied at A. */
export const nilAt = (a: Term): Term => app(c("nil"), a);
/** `cons : Π A, A → List A → List A` applied. */
export const consAt = (a: Term, head: Term, tail: Term): Term => apps(c("cons"), a, head, tail);

export function touchProofEnvironment(): Environment {
  let env: Environment = emptyEnvironment();
  const add = (name: string, declaration: DefinitionInput): void => { env = checkDeclaration(name, declaration, env); };
  env = declareInductive("Elem", [{ name: "element", fields: [] }], env);
  env = declareInductive("Bool", [
    { name: "true", fields: [] },
    { name: "false", fields: [] },
  ], env);
  env = declareInductive("Nat", [
    { name: "zero", fields: [] },
    { name: "succ", fields: [{ name: "pred", type: c("Nat") }] },
  ], env);
  // Genuinely parameterized: `List : Type → Type`, so `List A`, `nil A` and
  // `cons A x xs` all carry the element type explicitly.
  env = declareParameterizedInductive("List", [{ name: "A", type: type(0) }], [
    { name: "nil", fields: [] },
    { name: "cons", fields: [{ name: "head", type: v("A") }, { name: "tail", type: listType(v("A")) }] },
  ], env);
  // Conjunction over the propositional universe. TouchProof displays that
  // universe as `Prop`, but the kernel is predicative: `Prop` IS `Type 0`,
  // and `and` is an ordinary parameterized inductive with one constructor.
  env = declareParameterizedInductive("and", [
    { name: "A", type: type(0) },
    { name: "B", type: type(0) },
  ], [
    { name: "conj", fields: [{ name: "a", type: v("A") }, { name: "b", type: v("B") }] },
  ], env);

  const boolMotive = lambda("_", c("Bool"), c("Bool"));
  add("negb", {
    type: arrow(c("Bool"), c("Bool")),
    value: lambda("b", c("Bool"), recursor("Bool", boolMotive, [c("false"), c("true")], v("b"))),
  });
  const natMotive = lambda("_", c("Nat"), c("Nat"));
  add("add", {
    type: pis([["left", c("Nat")], ["right", c("Nat")]], c("Nat")),
    value: lambda("left", c("Nat"), lambda("right", c("Nat"), recursor("Nat", natMotive, [
      v("right"),
      lambda("pred", c("Nat"), lambda("ih_pred", c("Nat"), app(c("succ"), v("ih_pred")))),
    ], v("left")))),
  });
  // append : Π A, List A → List A → List A
  add("append", {
    type: pis([["A", type(0)], ["left", listType(v("A"))], ["right", listType(v("A"))]], listType(v("A"))),
    value: lambdas([["A", type(0)], ["left", listType(v("A"))], ["right", listType(v("A"))]],
      recursor("List", lambda("_", listType(v("A")), listType(v("A"))), [
        v("right"),
        lambdas([["head", v("A")], ["tail", listType(v("A"))], ["ih_tail", listType(v("A"))]], consAt(v("A"), v("head"), v("ih_tail"))),
      ], v("left"), [v("A")])),
  });
  // map : Π A B, (A → B) → List A → List B
  add("map", {
    type: pis([["A", type(0)], ["B", type(0)], ["f", arrow(v("A"), v("B"))], ["xs", listType(v("A"))]], listType(v("B"))),
    value: lambdas([["A", type(0)], ["B", type(0)], ["f", arrow(v("A"), v("B"))], ["xs", listType(v("A"))]],
      recursor("List", lambda("_", listType(v("A")), listType(v("B"))), [
        nilAt(v("B")),
        lambdas([["head", v("A")], ["tail", listType(v("A"))], ["ih_tail", listType(v("B"))]], consAt(v("B"), app(v("f"), v("head")), v("ih_tail"))),
      ], v("xs"), [v("A")])),
  });
  // rev : Π A, List A → List A
  add("rev", {
    type: pis([["A", type(0)], ["xs", listType(v("A"))]], listType(v("A"))),
    value: lambdas([["A", type(0)], ["xs", listType(v("A"))]],
      recursor("List", lambda("_", listType(v("A")), listType(v("A"))), [
        nilAt(v("A")),
        lambdas([["head", v("A")], ["tail", listType(v("A"))], ["ih_tail", listType(v("A"))]],
          apps(c("append"), v("A"), v("ih_tail"), consAt(v("A"), v("head"), nilAt(v("A"))))),
      ], v("xs"), [v("A")])),
  });
  // revAcc : Π A, List A → List A → List A
  add("revAcc", {
    type: pis([["A", type(0)], ["xs", listType(v("A"))], ["acc", listType(v("A"))]], listType(v("A"))),
    value: lambdas([["A", type(0)], ["xs", listType(v("A"))], ["acc", listType(v("A"))]], apps(
      recursor("List", lambda("_", listType(v("A")), arrow(listType(v("A")), listType(v("A")))), [
        lambda("current", listType(v("A")), v("current")),
        lambdas([["head", v("A")], ["tail", listType(v("A"))], ["ih_tail", arrow(listType(v("A")), listType(v("A")))]],
          lambda("current", listType(v("A")), app(v("ih_tail"), consAt(v("A"), v("head"), v("current"))))),
      ], v("xs"), [v("A")]),
      v("acc"),
    )),
  });
  // length : Π A, List A → Nat
  add("length", {
    type: pis([["A", type(0)], ["xs", listType(v("A"))]], c("Nat")),
    value: lambdas([["A", type(0)], ["xs", listType(v("A"))]],
      recursor("List", lambda("_", listType(v("A")), c("Nat")), [
        c("zero"),
        lambdas([["head", v("A")], ["tail", listType(v("A"))], ["ih_tail", c("Nat")]], app(c("succ"), v("ih_tail"))),
      ], v("xs"), [v("A")])),
  });
  // compose : Π A B C, (B → C) → (A → B) → A → C
  add("compose", {
    type: pis([["A", type(0)], ["B", type(0)], ["C", type(0)], ["f", arrow(v("B"), v("C"))], ["g", arrow(v("A"), v("B"))], ["x", v("A")]], v("C")),
    value: lambdas([["A", type(0)], ["B", type(0)], ["C", type(0)], ["f", arrow(v("B"), v("C"))], ["g", arrow(v("A"), v("B"))], ["x", v("A")]],
      app(v("f"), app(v("g"), v("x")))),
  });

  add("bool_induction", {
    type: pis([["P", arrow(c("Bool"), type(0))], ["trueCase", app(v("P"), c("true"))], ["falseCase", app(v("P"), c("false"))], ["b", c("Bool")]], app(v("P"), v("b"))),
    value: lambda("P", arrow(c("Bool"), type(0)), lambda("trueCase", app(v("P"), c("true")), lambda("falseCase", app(v("P"), c("false")), lambda("b", c("Bool"), recursor("Bool", v("P"), [v("trueCase"), v("falseCase")], v("b")))))),
  });
  add("nat_induction", {
    type: pis([["P", arrow(c("Nat"), type(0))], ["zeroCase", app(v("P"), c("zero"))], ["succCase", pis([["n", c("Nat")], ["ih", app(v("P"), v("n"))]], app(v("P"), app(c("succ"), v("n"))))], ["n", c("Nat")]], app(v("P"), v("n"))),
    value: lambda("P", arrow(c("Nat"), type(0)), lambda("zeroCase", app(v("P"), c("zero")), lambda("succCase", pis([["n", c("Nat")], ["ih", app(v("P"), v("n"))]], app(v("P"), app(c("succ"), v("n")))), lambda("n", c("Nat"), recursor("Nat", v("P"), [v("zeroCase"), v("succCase")], v("n")))))),
  });
  // list_induction : Π A (P : List A → Type 0), P (nil A) → (Π x xs, P xs → P (cons A x xs)) → Π xs, P xs
  add("list_induction", {
    type: pis([
      ["A", type(0)],
      ["P", arrow(listType(v("A")), type(0))],
      ["nilCase", app(v("P"), nilAt(v("A")))],
      ["consCase", pis([["x", v("A")], ["xs", listType(v("A"))], ["ih", app(v("P"), v("xs"))]], app(v("P"), consAt(v("A"), v("x"), v("xs"))))],
      ["xs", listType(v("A"))],
    ], app(v("P"), v("xs"))),
    value: lambdas([
      ["A", type(0)],
      ["P", arrow(listType(v("A")), type(0))],
      ["nilCase", app(v("P"), nilAt(v("A")))],
      ["consCase", pis([["x", v("A")], ["xs", listType(v("A"))], ["ih", app(v("P"), v("xs"))]], app(v("P"), consAt(v("A"), v("x"), v("xs"))))],
      ["xs", listType(v("A"))],
    ], recursor("List", v("P"), [v("nilCase"), v("consCase")], v("xs"), [v("A")])),
  });

  add("eq_symm", {
    type: pis([["A", type(0)], ["x", v("A")], ["y", v("A")], ["proof", equal(v("A"), v("x"), v("y"))]], equal(v("A"), v("y"), v("x"))),
    value: lambda("A", type(0),
      lambda("x", v("A"),
        lambda("y", v("A"),
          lambda("proof", equal(v("A"), v("x"), v("y")),
            subst(v("proof"), lambda("z", v("A"), equal(v("A"), v("z"), v("x"))), refl(v("x"))))))),
  });
  add("eq_trans", {
    type: pis([["A", type(0)], ["x", v("A")], ["y", v("A")], ["z", v("A")], ["left", equal(v("A"), v("x"), v("y"))], ["right", equal(v("A"), v("y"), v("z"))]], equal(v("A"), v("x"), v("z"))),
    value: lambda("A", type(0),
      lambda("x", v("A"),
        lambda("y", v("A"),
          lambda("z", v("A"),
            lambda("left", equal(v("A"), v("x"), v("y")),
              lambda("right", equal(v("A"), v("y"), v("z")),
                subst(v("right"), lambda("w", v("A"), equal(v("A"), v("x"), v("w"))), v("left")))))))),
  });
  add("congr_arg", {
    type: pis([["A", type(0)], ["B", type(0)], ["f", arrow(v("A"), v("B"))], ["x", v("A")], ["y", v("A")], ["proof", equal(v("A"), v("x"), v("y"))]], equal(v("B"), app(v("f"), v("x")), app(v("f"), v("y")))),
    value: lambda("A", type(0),
      lambda("B", type(0),
        lambda("f", arrow(v("A"), v("B")),
          lambda("x", v("A"),
            lambda("y", v("A"),
              lambda("proof", equal(v("A"), v("x"), v("y")),
                subst(v("proof"),
                  lambda("z", v("A"), equal(v("B"), app(v("f"), v("x")), app(v("f"), v("z")))),
                  refl(app(v("f"), v("x")))))))))),
  });

  const equations: readonly [string, Term, Term][] = [
    ["negb_true", equal(c("Bool"), app(c("negb"), c("true")), c("false")), app(c("negb"), c("true"))],
    ["negb_false", equal(c("Bool"), app(c("negb"), c("false")), c("true")), app(c("negb"), c("false"))],
  ];
  for (const [name, theoremType, left] of equations) add(name, { type: theoremType, value: refl(left) });
  // rev_nil : Π A, rev A (nil A) = nil A
  add("rev_nil", {
    type: pis([["A", type(0)]], equal(listType(v("A")), apps(c("rev"), v("A"), nilAt(v("A"))), nilAt(v("A")))),
    value: lambda("A", type(0), refl(apps(c("rev"), v("A"), nilAt(v("A"))))),
  });
  addDefinitionalEquations(add);

  const appendNil = appendNilRightProof();
  add("append_nil_right", { type: appendNil.type, value: appendNil.term });
  const appendAssoc = appendAssociativityProof();
  add("append_assoc", { type: appendAssoc.type, value: appendAssoc.term });
  const revAppend = revAppendProof();
  add("rev_append", { type: revAppend.type, value: revAppend.term });
  const addZero = addZeroRightProof();
  add("add_zero_right", { type: addZero.type, value: addZero.term });
  const addSucc = addSuccRightProof();
  add("add_succ_right", { type: addSucc.type, value: addSucc.term });
  const addOne = addOneRightProof();
  add("add_one_right", { type: addOne.type, value: addOne.term });
  const addAssoc = addAssocProof();
  add("add_assoc", { type: addAssoc.type, value: addAssoc.term });
  const lengthAppend = lengthAppendProof();
  add("length_append", { type: lengthAppend.type, value: lengthAppend.term });
  return env;
}

function addDefinitionalEquations(add: (name: string, declaration: DefinitionInput) => void): void {
  const A = v("A");
  const B = v("B");
  const list = (a: Term): Term => listType(a);
  const definitions: readonly [string, Term, Term][] = [
    ["add_zero_left", pis([["m", c("Nat")]], equal(c("Nat"), apps(c("add"), c("zero"), v("m")), v("m"))),
      lambda("m", c("Nat"), refl(apps(c("add"), c("zero"), v("m"))))],
    ["add_succ_left", pis([["n", c("Nat")], ["m", c("Nat")]], equal(c("Nat"), apps(c("add"), app(c("succ"), v("n")), v("m")), app(c("succ"), apps(c("add"), v("n"), v("m"))))),
      lambda("n", c("Nat"), lambda("m", c("Nat"), refl(apps(c("add"), app(c("succ"), v("n")), v("m")))))],
    // map_nil : Π A B (f : A → B), map A B f (nil A) = nil B
    ["map_nil", pis([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)]], equal(list(B), apps(c("map"), A, B, v("f"), nilAt(A)), nilAt(B))),
      lambdas([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)]], refl(apps(c("map"), A, B, v("f"), nilAt(A))))],
    // map_cons : Π A B (f) x xs, map A B f (cons A x xs) = cons B (f x) (map A B f xs)
    ["map_cons", pis([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)], ["x", A], ["xs", list(A)]],
      equal(list(B), apps(c("map"), A, B, v("f"), consAt(A, v("x"), v("xs"))), consAt(B, app(v("f"), v("x")), apps(c("map"), A, B, v("f"), v("xs"))))),
      lambdas([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)], ["x", A], ["xs", list(A)]], refl(apps(c("map"), A, B, v("f"), consAt(A, v("x"), v("xs")))))],
    // append_nil_left : Π A ys, append A (nil A) ys = ys
    ["append_nil_left", pis([["A", type(0)], ["ys", list(A)]], equal(list(A), apps(c("append"), A, nilAt(A), v("ys")), v("ys"))),
      lambdas([["A", type(0)], ["ys", list(A)]], refl(apps(c("append"), A, nilAt(A), v("ys"))))],
    // append_cons_left : Π A x xs ys, append A (cons A x xs) ys = cons A x (append A xs ys)
    ["append_cons_left", pis([["A", type(0)], ["x", A], ["xs", list(A)], ["ys", list(A)]],
      equal(list(A), apps(c("append"), A, consAt(A, v("x"), v("xs")), v("ys")), consAt(A, v("x"), apps(c("append"), A, v("xs"), v("ys"))))),
      lambdas([["A", type(0)], ["x", A], ["xs", list(A)], ["ys", list(A)]], refl(apps(c("append"), A, consAt(A, v("x"), v("xs")), v("ys"))))],
    // rev_cons : Π A x xs, rev A (cons A x xs) = append A (rev A xs) (cons A x (nil A))
    ["rev_cons", pis([["A", type(0)], ["x", A], ["xs", list(A)]],
      equal(list(A), apps(c("rev"), A, consAt(A, v("x"), v("xs"))), apps(c("append"), A, apps(c("rev"), A, v("xs")), consAt(A, v("x"), nilAt(A))))),
      lambdas([["A", type(0)], ["x", A], ["xs", list(A)]], refl(apps(c("rev"), A, consAt(A, v("x"), v("xs")))))],
    // compose_apply : Π A B C (f : B → C) (g : A → B) x, compose A B C f g x = f (g x)
    ["compose_apply", pis([["A", type(0)], ["B", type(0)], ["C", type(0)], ["f", arrow(B, v("C"))], ["g", arrow(A, B)], ["x", A]],
      equal(v("C"), apps(c("compose"), A, B, v("C"), v("f"), v("g"), v("x")), app(v("f"), app(v("g"), v("x"))))),
      lambdas([["A", type(0)], ["B", type(0)], ["C", type(0)], ["f", arrow(B, v("C"))], ["g", arrow(A, B)], ["x", A]], refl(apps(c("compose"), A, B, v("C"), v("f"), v("g"), v("x"))))],
    // revAcc_nil : Π A acc, revAcc A (nil A) acc = acc
    ["revAcc_nil", pis([["A", type(0)], ["acc", list(A)]], equal(list(A), apps(c("revAcc"), A, nilAt(A), v("acc")), v("acc"))),
      lambdas([["A", type(0)], ["acc", list(A)]], refl(apps(c("revAcc"), A, nilAt(A), v("acc"))))],
    // revAcc_cons : Π A x xs acc, revAcc A (cons A x xs) acc = revAcc A xs (cons A x acc)
    ["revAcc_cons", pis([["A", type(0)], ["x", A], ["xs", list(A)], ["acc", list(A)]],
      equal(list(A), apps(c("revAcc"), A, consAt(A, v("x"), v("xs")), v("acc")), apps(c("revAcc"), A, v("xs"), consAt(A, v("x"), v("acc"))))),
      lambdas([["A", type(0)], ["x", A], ["xs", list(A)], ["acc", list(A)]], refl(apps(c("revAcc"), A, consAt(A, v("x"), v("xs")), v("acc"))))],
    // length_nil : Π A, length A (nil A) = zero
    ["length_nil", pis([["A", type(0)]], equal(c("Nat"), apps(c("length"), A, nilAt(A)), c("zero"))),
      lambda("A", type(0), refl(apps(c("length"), A, nilAt(A))))],
    // length_cons : Π A x xs, length A (cons A x xs) = succ (length A xs)
    ["length_cons", pis([["A", type(0)], ["x", A], ["xs", list(A)]], equal(c("Nat"), apps(c("length"), A, consAt(A, v("x"), v("xs"))), app(c("succ"), apps(c("length"), A, v("xs"))))),
      lambdas([["A", type(0)], ["x", A], ["xs", list(A)]], refl(apps(c("length"), A, consAt(A, v("x"), v("xs")))))],
  ];
  for (const [name, theoremType, value] of definitions) add(name, { type: theoremType, value });
}

// ---------------------------------------------------------------------------
// Hand-assembled curriculum certificates, now polymorphic. Each list lesson
// quantifies its element type variable(s) as leading Π/λ binders and threads
// them through every applied `List`, constructor, and list function.
// ---------------------------------------------------------------------------

export function appendAssociativityProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const list = listType(A);
  const xs = v("xs");
  const ys = v("ys");
  const zs = v("zs");
  const x = v("x");
  const tail = v("tail");
  const nil = nilAt(A);
  const cons = (head: Term, rest: Term): Term => consAt(A, head, rest);
  const append = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const proposition = (value: Term): Term => equal(list, append(append(value, ys), zs), append(value, append(ys, zs)));
  const motive = lambda("value", list, proposition(v("value")));
  const base = refl(append(append(nil, ys), zs));
  const step = lambda("x", A, lambda("tail", list, lambda("ih", proposition(tail), congr(
    list,
    list,
    lambda("rest", list, cons(x, v("rest"))),
    append(append(tail, ys), zs),
    append(tail, append(ys, zs)),
    v("ih"),
  ))));
  return {
    type: pis([["A", type(0)], ["xs", list], ["ys", list], ["zs", list]], proposition(xs)),
    term: lambdas([["A", type(0)], ["xs", list], ["ys", list], ["zs", list]], apps(c("list_induction"), A, motive, base, step, xs)),
  };
}

function symm(a: Term, x: Term, y: Term, proof: Term): Term {
  return apps(c("eq_symm"), a, x, y, proof);
}

function trans(a: Term, x: Term, y: Term, z: Term, left: Term, right: Term): Term {
  return apps(c("eq_trans"), a, x, y, z, left, right);
}

function congr(a: Term, b: Term, fn: Term, x: Term, y: Term, proof: Term): Term {
  return apps(c("congr_arg"), a, b, fn, x, y, proof);
}

/** Kernel proof term behind the visual map-composition walkthrough. Polymorphic in A, B, C. */
export function mapCompositionProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const B = v("B");
  const C = v("C");
  const listA = listType(A);
  const listB = listType(B);
  const listC = listType(C);
  const f = v("f");
  const g = v("g");
  const xs = v("xs");
  const x = v("x");
  const ih = v("ih");
  // f : B → C, g : A → B, so compose A B C f g : A → C, map (compose) : List A → List C.
  const map = (elemFrom: Term, elemTo: Term, fn: Term, value: Term): Term => apps(c("map"), elemFrom, elemTo, fn, value);
  const composed = apps(c("compose"), A, B, C, f, g);
  const mappedComposition = (value: Term): Term => map(A, C, composed, value);
  const mappedTwice = (value: Term): Term => map(B, C, f, map(A, B, g, value));
  const proposition = (value: Term): Term => equal(listC, mappedComposition(value), mappedTwice(value));
  const motive = lambda("value", listA, proposition(v("value")));

  const lhsNil = mappedComposition(nilAt(A));
  const rhsNil = mappedTwice(nilAt(A));
  const mapFNil = map(B, C, f, nilAt(B));
  const mapFPartial = apps(c("map"), B, C, f);
  const rhsNilToMapFNil = congr(
    listB, listC, mapFPartial, map(A, B, g, nilAt(A)), nilAt(B), apps(c("map_nil"), A, B, g),
  );
  const rhsNilToNil = trans(listC, rhsNil, mapFNil, nilAt(C), rhsNilToMapFNil, apps(c("map_nil"), B, C, f));
  const nilCase = trans(
    listC,
    lhsNil,
    nilAt(C),
    rhsNil,
    apps(c("map_nil"), A, C, composed),
    symm(listC, rhsNil, nilAt(C), rhsNilToNil),
  );

  const consXs = consAt(A, x, xs);
  const lhs = mappedComposition(consXs);
  const composedX = app(composed, x);
  const fgX = app(f, app(g, x));
  const mapComposedXs = mappedComposition(xs);
  const mapTwiceXs = mappedTwice(xs);
  const afterMapCons = consAt(C, composedX, mapComposedXs);
  const afterHead = consAt(C, fgX, mapComposedXs);
  const common = consAt(C, fgX, mapTwiceXs);
  const rhs = mappedTwice(consXs);

  const headStep = congr(
    C,
    listC,
    lambda("head", C, consAt(C, v("head"), mapComposedXs)),
    composedX,
    fgX,
    apps(c("compose_apply"), A, B, C, f, g, x),
  );
  const tailStep = congr(
    listC,
    listC,
    lambda("tail", listC, consAt(C, fgX, v("tail"))),
    mapComposedXs,
    mapTwiceXs,
    ih,
  );
  const mapGCons = apps(c("map_cons"), A, B, g, x, xs);
  const rhsToMapFCons = congr(
    listB,
    listC,
    mapFPartial,
    map(A, B, g, consXs),
    consAt(B, app(g, x), map(A, B, g, xs)),
    mapGCons,
  );
  const rhsToCommon = trans(
    listC,
    rhs,
    map(B, C, f, consAt(B, app(g, x), map(A, B, g, xs))),
    common,
    rhsToMapFCons,
    apps(c("map_cons"), B, C, f, app(g, x), map(A, B, g, xs)),
  );
  const consCaseBody = trans(
    listC,
    lhs,
    afterMapCons,
    rhs,
    apps(c("map_cons"), A, C, composed, x, xs),
    trans(
      listC,
      afterMapCons,
      afterHead,
      rhs,
      headStep,
      trans(listC, afterHead, common, rhs, tailStep, symm(listC, rhs, common, rhsToCommon)),
    ),
  );
  const consCase = lambda("x", A, lambda("xs", listA, lambda("ih", proposition(xs), consCaseBody)));

  const theoremType = pis([["A", type(0)], ["B", type(0)], ["C", type(0)], ["f", arrow(B, C)], ["g", arrow(A, B)], ["xs", listA]], proposition(xs));
  const proof = lambdas([["A", type(0)], ["B", type(0)], ["C", type(0)], ["f", arrow(B, C)], ["g", arrow(A, B)]],
    apps(c("list_induction"), A, motive, nilCase, consCase));
  return { type: theoremType, term: proof };
}

export function verifyMapCompositionProof(): void {
  const theorem = mapCompositionProof();
  check(theorem.term, theorem.type, new Map(), touchProofEnvironment());
}

export function booleanInvolutionProof(): { readonly type: Term; readonly term: Term } {
  const bool = c("Bool");
  const neg = (value: Term): Term => app(c("negb"), value);
  const proposition = (value: Term): Term => equal(bool, neg(neg(value)), value);
  const motive = lambda("b", bool, proposition(v("b")));
  const trueStep = trans(
    bool,
    neg(neg(c("true"))),
    neg(c("false")),
    c("true"),
    congr(bool, bool, c("negb"), neg(c("true")), c("false"), c("negb_true")),
    c("negb_false"),
  );
  const falseStep = trans(
    bool,
    neg(neg(c("false"))),
    neg(c("true")),
    c("false"),
    congr(bool, bool, c("negb"), neg(c("false")), c("true"), c("negb_false")),
    c("negb_true"),
  );
  return {
    type: pi("b", bool, proposition(v("b"))),
    term: apps(c("bool_induction"), motive, trueStep, falseStep),
  };
}

export function addZeroRightProof(): { readonly type: Term; readonly term: Term } {
  const nat = c("Nat");
  const proposition = (value: Term): Term => equal(nat, apps(c("add"), value, c("zero")), value);
  const motive = lambda("n", nat, proposition(v("n")));
  const n = v("n");
  const ih = v("ih");
  const succN = app(c("succ"), n);
  const successorCase = lambda("n", nat, lambda("ih", proposition(n), trans(
    nat,
    apps(c("add"), succN, c("zero")),
    app(c("succ"), apps(c("add"), n, c("zero"))),
    succN,
    apps(c("add_succ_left"), n, c("zero")),
    congr(nat, nat, c("succ"), apps(c("add"), n, c("zero")), n, ih),
  )));
  return {
    type: pi("n", nat, proposition(v("n"))),
    term: apps(c("nat_induction"), motive, apps(c("add_zero_left"), c("zero")), successorCase),
  };
}

/** The arithmetic bridge `n + S 0 = S n`, reused by length_rev. */
export function addOneRightProof(): { readonly type: Term; readonly term: Term } {
  const nat = c("Nat");
  const n = v("n");
  const add = (left: Term, right: Term): Term => apps(c("add"), left, right);
  const succ = (value: Term): Term => app(c("succ"), value);
  const proposition = (value: Term): Term => equal(nat, add(value, succ(c("zero"))), succ(value));
  return {
    type: pis([["n", nat]], proposition(n)),
    term: lambda("n", nat, trans(
      nat,
      add(n, succ(c("zero"))),
      succ(add(n, c("zero"))),
      succ(n),
      apps(c("add_succ_right"), n, c("zero")),
      congr(nat, nat, c("succ"), add(n, c("zero")), n, apps(c("add_zero_right"), n)),
    )),
  };
}

export function addSuccRightProof(): { readonly type: Term; readonly term: Term } {
  const nat = c("Nat");
  const m = v("m");
  const n = v("n");
  const ih = v("ih");
  const add = (left: Term, right: Term): Term => apps(c("add"), left, right);
  const succ = (value: Term): Term => app(c("succ"), value);
  const proposition = (value: Term): Term => equal(nat, add(value, succ(m)), succ(add(value, m)));
  const motive = lambda("n", nat, proposition(v("n")));
  const base = refl(add(c("zero"), succ(m)));
  const succN = succ(n);
  const target = succ(succ(add(n, m)));
  const successorCase = lambda("n", nat, lambda("ih", proposition(n), trans(
    nat,
    add(succN, succ(m)),
    succ(add(n, succ(m))),
    succ(add(succN, m)),
    apps(c("add_succ_left"), n, succ(m)),
    trans(
      nat,
      succ(add(n, succ(m))),
      target,
      succ(add(succN, m)),
      congr(nat, nat, c("succ"), add(n, succ(m)), succ(add(n, m)), ih),
      symm(nat, succ(add(succN, m)), target, congr(nat, nat, c("succ"), add(succN, m), succ(add(n, m)), apps(c("add_succ_left"), n, m))),
    ),
  )));
  return {
    type: pis([["n", nat], ["m", nat]], proposition(v("n"))),
    term: lambda("n", nat, lambda("m", nat, apps(c("nat_induction"), motive, base, successorCase, v("n")))),
  };
}

export function addAssocProof(): { readonly type: Term; readonly term: Term } {
  const nat = c("Nat");
  const a = v("a");
  const b = v("b");
  const cc = v("c");
  const ih = v("ih");
  const add = (left: Term, right: Term): Term => apps(c("add"), left, right);
  const succ = (value: Term): Term => app(c("succ"), value);
  const proposition = (value: Term): Term => equal(nat, add(add(value, b), cc), add(value, add(b, cc)));
  const motive = lambda("a", nat, proposition(v("a")));
  const base = refl(add(add(c("zero"), b), cc));
  const succA = succ(a);
  const successorCase = lambda("a", nat, lambda("ih", proposition(a), trans(
    nat,
    add(add(succA, b), cc),
    add(succ(add(a, b)), cc),
    add(succA, add(b, cc)),
    congr(nat, nat, lambda("front", nat, add(v("front"), cc)), add(succA, b), succ(add(a, b)), apps(c("add_succ_left"), a, b)),
    trans(
      nat,
      add(succ(add(a, b)), cc),
      succ(add(add(a, b), cc)),
      add(succA, add(b, cc)),
      apps(c("add_succ_left"), add(a, b), cc),
      trans(
        nat,
        succ(add(add(a, b), cc)),
        succ(add(a, add(b, cc))),
        add(succA, add(b, cc)),
        congr(nat, nat, c("succ"), add(add(a, b), cc), add(a, add(b, cc)), ih),
        symm(nat, add(succA, add(b, cc)), succ(add(a, add(b, cc))), apps(c("add_succ_left"), a, add(b, cc))),
      ),
    ),
  )));
  return {
    type: pis([["a", nat], ["b", nat], ["c", nat]], proposition(v("a"))),
    term: lambda("a", nat, lambda("b", nat, lambda("c", nat, apps(c("nat_induction"), motive, base, successorCase, v("a"))))),
  };
}

export function addCommProof(): { readonly type: Term; readonly term: Term } {
  const nat = c("Nat");
  const a = v("a");
  const b = v("b");
  const ih = v("ih");
  const add = (left: Term, right: Term): Term => apps(c("add"), left, right);
  const succ = (value: Term): Term => app(c("succ"), value);
  const proposition = (value: Term): Term => equal(nat, add(value, b), add(b, value));
  const motive = lambda("a", nat, proposition(v("a")));
  const base = trans(
    nat,
    add(c("zero"), b),
    b,
    add(b, c("zero")),
    apps(c("add_zero_left"), b),
    symm(nat, add(b, c("zero")), b, apps(c("add_zero_right"), b)),
  );
  const succA = succ(a);
  const successorCase = lambda("a", nat, lambda("ih", proposition(a), trans(
    nat,
    add(succA, b),
    succ(add(a, b)),
    add(b, succA),
    apps(c("add_succ_left"), a, b),
    trans(
      nat,
      succ(add(a, b)),
      succ(add(b, a)),
      add(b, succA),
      congr(nat, nat, c("succ"), add(a, b), add(b, a), ih),
      symm(nat, add(b, succA), succ(add(b, a)), apps(c("add_succ_right"), b, a)),
    ),
  )));
  return {
    type: pis([["a", nat], ["b", nat]], proposition(v("a"))),
    term: lambda("a", nat, lambda("b", nat, apps(c("nat_induction"), motive, base, successorCase, v("a")))),
  };
}

export function lengthAppendProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const list = listType(A);
  const nat = c("Nat");
  const ys = v("ys");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const nil = nilAt(A);
  const cons = (head: Term, rest: Term): Term => consAt(A, head, rest);
  const len = (value: Term): Term => apps(c("length"), A, value);
  const add = (left: Term, right: Term): Term => apps(c("add"), left, right);
  const append = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const succ = (value: Term): Term => app(c("succ"), value);
  const proposition = (value: Term): Term => equal(nat, len(append(value, ys)), add(len(value), len(ys)));
  const motive = lambda("xs", list, proposition(v("xs")));
  const base = trans(
    nat,
    len(append(nil, ys)),
    len(ys),
    add(len(nil), len(ys)),
    congr(list, nat, apps(c("length"), A), append(nil, ys), ys, apps(c("append_nil_left"), A, ys)),
    symm(
      nat,
      add(len(nil), len(ys)),
      len(ys),
      trans(
        nat,
        add(len(nil), len(ys)),
        add(c("zero"), len(ys)),
        len(ys),
        congr(nat, nat, lambda("front", nat, add(v("front"), len(ys))), len(nil), c("zero"), apps(c("length_nil"), A)),
        apps(c("add_zero_left"), len(ys)),
      ),
    ),
  );
  const consXs = cons(x, xs);
  const common = succ(add(len(xs), len(ys)));
  const leftChain = trans(
    nat,
    len(append(consXs, ys)),
    len(cons(x, append(xs, ys))),
    common,
    congr(list, nat, apps(c("length"), A), append(consXs, ys), cons(x, append(xs, ys)), apps(c("append_cons_left"), A, x, xs, ys)),
    trans(
      nat,
      len(cons(x, append(xs, ys))),
      succ(len(append(xs, ys))),
      common,
      apps(c("length_cons"), A, x, append(xs, ys)),
      congr(nat, nat, c("succ"), len(append(xs, ys)), add(len(xs), len(ys)), ih),
    ),
  );
  const rhsToCommon = trans(
    nat,
    add(len(consXs), len(ys)),
    add(succ(len(xs)), len(ys)),
    common,
    congr(nat, nat, lambda("front", nat, add(v("front"), len(ys))), len(consXs), succ(len(xs)), apps(c("length_cons"), A, x, xs)),
    apps(c("add_succ_left"), len(xs), len(ys)),
  );
  const step = lambda("x", A, lambda("xs", list, lambda("ih", proposition(xs),
    trans(nat, len(append(consXs, ys)), common, add(len(consXs), len(ys)), leftChain, symm(nat, add(len(consXs), len(ys)), common, rhsToCommon)))));
  return {
    type: pis([["A", type(0)], ["xs", list], ["ys", list]], proposition(v("xs"))),
    term: lambdas([["A", type(0)], ["xs", list], ["ys", list]], apps(c("list_induction"), A, motive, base, step, v("xs"))),
  };
}

export function lengthRevProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const list = listType(A);
  const nat = c("Nat");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const nil = nilAt(A);
  const cons = (head: Term, rest: Term): Term => consAt(A, head, rest);
  const len = (value: Term): Term => apps(c("length"), A, value);
  const rev = (value: Term): Term => apps(c("rev"), A, value);
  const add = (left: Term, right: Term): Term => apps(c("add"), left, right);
  const append = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const succ = (value: Term): Term => app(c("succ"), value);
  const singleton = cons(x, nil);
  const proposition = (value: Term): Term => equal(nat, len(rev(value)), len(value));
  const motive = lambda("xs", list, proposition(v("xs")));
  const base = refl(len(rev(nil)));
  const consXs = cons(x, xs);
  const lenSingleton = succ(len(nil));
  const afterRevCons = len(append(rev(xs), singleton));
  const afterLengthAppend = add(len(rev(xs)), len(singleton));
  const afterIH = add(len(xs), len(singleton));
  const target = succ(len(xs));
  const leftChain = trans(
    nat,
    len(rev(consXs)),
    afterRevCons,
    target,
    congr(list, nat, apps(c("length"), A), rev(consXs), append(rev(xs), singleton), apps(c("rev_cons"), A, x, xs)),
    trans(
      nat,
      afterRevCons,
      afterLengthAppend,
      target,
      apps(c("length_append"), A, rev(xs), singleton),
      trans(
        nat,
        afterLengthAppend,
        afterIH,
        target,
        congr(nat, nat, lambda("front", nat, add(v("front"), len(singleton))), len(rev(xs)), len(xs), ih),
        trans(
          nat,
          afterIH,
          add(len(xs), lenSingleton),
          target,
          congr(nat, nat, lambda("back", nat, add(len(xs), v("back"))), len(singleton), lenSingleton, apps(c("length_cons"), A, x, nil)),
          trans(
            nat,
            add(len(xs), lenSingleton),
            add(len(xs), succ(c("zero"))),
            target,
            congr(nat, nat, lambda("back", nat, add(len(xs), v("back"))), lenSingleton, succ(c("zero")), congr(nat, nat, c("succ"), len(nil), c("zero"), apps(c("length_nil"), A))),
            trans(
              nat,
              add(len(xs), succ(c("zero"))),
              succ(add(len(xs), c("zero"))),
              target,
              apps(c("add_succ_right"), len(xs), c("zero")),
              congr(nat, nat, c("succ"), add(len(xs), c("zero")), len(xs), apps(c("add_zero_right"), len(xs))),
            ),
          ),
        ),
      ),
    ),
  );
  const step = lambda("x", A, lambda("xs", list, lambda("ih", proposition(xs),
    trans(nat, len(rev(consXs)), target, len(consXs), leftChain, symm(nat, len(consXs), target, apps(c("length_cons"), A, x, xs))))));
  return {
    type: pis([["A", type(0)], ["xs", list]], proposition(v("xs"))),
    term: lambdas([["A", type(0)], ["xs", list]], apps(c("list_induction"), A, motive, base, step, v("xs"))),
  };
}

export function mapLengthProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const B = v("B");
  const listA = listType(A);
  const nat = c("Nat");
  const f = v("f");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const lenA = (value: Term): Term => apps(c("length"), A, value);
  const lenB = (value: Term): Term => apps(c("length"), B, value);
  const mapF = (value: Term): Term => apps(c("map"), A, B, f, value);
  const succ = (value: Term): Term => app(c("succ"), value);
  const proposition = (value: Term): Term => equal(nat, lenB(mapF(value)), lenA(value));
  const motive = lambda("xs", listA, proposition(v("xs")));
  const base = refl(lenB(mapF(nilAt(A))));
  const consXs = consAt(A, x, xs);
  const target = succ(lenA(xs));
  const mappedCons = consAt(B, app(f, x), mapF(xs));
  const leftChain = trans(
    nat,
    lenB(mapF(consXs)),
    lenB(mappedCons),
    target,
    congr(listType(B), nat, apps(c("length"), B), mapF(consXs), mappedCons, apps(c("map_cons"), A, B, f, x, xs)),
    trans(
      nat,
      lenB(mappedCons),
      succ(lenB(mapF(xs))),
      target,
      apps(c("length_cons"), B, app(f, x), mapF(xs)),
      congr(nat, nat, c("succ"), lenB(mapF(xs)), lenA(xs), ih),
    ),
  );
  const step = lambda("x", A, lambda("xs", listA, lambda("ih", proposition(xs),
    trans(nat, lenB(mapF(consXs)), target, lenA(consXs), leftChain, symm(nat, lenA(consXs), target, apps(c("length_cons"), A, x, xs))))));
  return {
    type: pis([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)], ["xs", listA]], proposition(v("xs"))),
    term: lambdas([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)]], apps(c("list_induction"), A, motive, base, step)),
  };
}

export function appendNilRightProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const list = listType(A);
  const nil = nilAt(A);
  const cons = (head: Term, rest: Term): Term => consAt(A, head, rest);
  const append = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const proposition = (value: Term): Term => equal(list, append(value, nil), value);
  const motive = lambda("xs", list, proposition(v("xs")));
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const consXs = cons(x, xs);
  const successorCase = lambda("x", A, lambda("xs", list, lambda("ih", proposition(xs), trans(
    list,
    append(consXs, nil),
    cons(x, append(xs, nil)),
    consXs,
    apps(c("append_cons_left"), A, x, xs, nil),
    congr(
      list,
      list,
      lambda("tail", list, cons(x, v("tail"))),
      append(xs, nil),
      xs,
      ih,
    ),
  ))));
  return {
    type: pis([["A", type(0)], ["xs", list]], proposition(v("xs"))),
    term: lambdas([["A", type(0)]], apps(c("list_induction"), A, motive, apps(c("append_nil_left"), A, nil), successorCase)),
  };
}

export function booleanComputationProof(): { readonly type: Term; readonly term: Term } {
  return {
    type: equal(c("Bool"), app(c("negb"), c("false")), c("true")),
    term: c("negb_false"),
  };
}

export function natAdditionExampleProof(): { readonly type: Term; readonly term: Term } {
  const nat = c("Nat");
  const zero = c("zero");
  const one = app(c("succ"), zero);
  const two = app(c("succ"), one);
  const three = app(c("succ"), two);
  const start = apps(c("add"), two, one);
  const afterFirst = app(c("succ"), apps(c("add"), one, one));
  const afterSecond = app(c("succ"), app(c("succ"), apps(c("add"), zero, one)));
  const first = apps(c("add_succ_left"), one, one);
  const second = congr(
    nat,
    nat,
    c("succ"),
    apps(c("add"), one, one),
    app(c("succ"), apps(c("add"), zero, one)),
    apps(c("add_succ_left"), zero, one),
  );
  const finish = congr(
    nat,
    nat,
    lambda("value", nat, app(c("succ"), app(c("succ"), v("value")))),
    apps(c("add"), zero, one),
    one,
    apps(c("add_zero_left"), one),
  );
  return {
    type: equal(nat, start, three),
    term: trans(nat, start, afterFirst, three, first,
      trans(nat, afterFirst, afterSecond, three, second, finish)),
  };
}

export function mapAppendProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const B = v("B");
  const listA = listType(A);
  const listB = listType(B);
  const f = v("f");
  const ys = v("ys");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const map = (value: Term): Term => apps(c("map"), A, B, f, value);
  const appendA = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const appendB = (left: Term, right: Term): Term => apps(c("append"), B, left, right);
  const proposition = (value: Term): Term => equal(
    listB,
    map(appendA(value, ys)),
    appendB(map(value), map(ys)),
  );
  const mapFYs = map(ys);
  const baseLeft = map(appendA(nilAt(A), ys));
  const baseRight = appendB(map(nilAt(A)), mapFYs);
  const leftToCommon = congr(listA, listB, apps(c("map"), A, B, f), appendA(nilAt(A), ys), ys, apps(c("append_nil_left"), A, ys));
  const rightToAppendNil = congr(
    listB, listB, lambda("head", listB, appendB(v("head"), mapFYs)),
    map(nilAt(A)), nilAt(B), apps(c("map_nil"), A, B, f),
  );
  const baseRightToCommon = trans(
    listB, baseRight, appendB(nilAt(B), mapFYs), mapFYs,
    rightToAppendNil, apps(c("append_nil_left"), B, mapFYs),
  );
  const base = trans(listB, baseLeft, mapFYs, baseRight, leftToCommon, symm(listB, baseRight, mapFYs, baseRightToCommon));

  const consXs = consAt(A, x, xs);
  const appended = appendA(xs, ys);
  const lhs = map(appendA(consXs, ys));
  const afterAppend = map(consAt(A, x, appended));
  const afterMap = consAt(B, app(f, x), map(appended));
  const common = consAt(B, app(f, x), appendB(map(xs), mapFYs));
  const rhs = appendB(map(consXs), mapFYs);
  const rhsAfterMap = appendB(consAt(B, app(f, x), map(xs)), mapFYs);
  const leftChain = trans(
    listB, lhs, afterAppend, common,
    congr(listA, listB, apps(c("map"), A, B, f), appendA(consXs, ys), consAt(A, x, appended), apps(c("append_cons_left"), A, x, xs, ys)),
    trans(
      listB, afterAppend, afterMap, common,
      apps(c("map_cons"), A, B, f, x, appended),
      congr(
        listB, listB, lambda("tail", listB, consAt(B, app(f, x), v("tail"))),
        map(appended), appendB(map(xs), mapFYs), ih,
      ),
    ),
  );
  const rightToCommon = trans(
    listB, rhs, rhsAfterMap, common,
    congr(
      listB, listB, lambda("front", listB, appendB(v("front"), mapFYs)),
      map(consXs), consAt(B, app(f, x), map(xs)), apps(c("map_cons"), A, B, f, x, xs),
    ),
    apps(c("append_cons_left"), B, app(f, x), map(xs), mapFYs),
  );
  const step = lambda("x", A, lambda("xs", listA, lambda("ih", proposition(xs),
    trans(listB, lhs, common, rhs, leftChain, symm(listB, rhs, common, rightToCommon)))));
  const motive = lambda("xs", listA, proposition(v("xs")));
  return {
    type: pis([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)], ["ys", listA], ["xs", listA]], proposition(v("xs"))),
    term: lambdas([["A", type(0)], ["B", type(0)], ["f", arrow(A, B)], ["ys", listA]], apps(c("list_induction"), A, motive, base, step)),
  };
}

export function revAppendProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const list = listType(A);
  const ys = v("ys");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const nil = nilAt(A);
  const cons = (head: Term, rest: Term): Term => consAt(A, head, rest);
  const rev = (value: Term): Term => apps(c("rev"), A, value);
  const append = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const proposition = (value: Term): Term => equal(list, rev(append(value, ys)), append(rev(ys), rev(value)));
  const baseLhs = rev(append(nil, ys));
  const baseRhs = append(rev(ys), rev(nil));
  const baseLeft = congr(list, list, apps(c("rev"), A), append(nil, ys), ys, apps(c("append_nil_left"), A, ys));
  const baseRight = trans(
    list, baseRhs, append(rev(ys), nil), rev(ys),
    congr(list, list, lambda("tail", list, append(rev(ys), v("tail"))), rev(nil), nil, apps(c("rev_nil"), A)),
    apps(c("append_nil_right"), A, rev(ys)),
  );
  const base = trans(list, baseLhs, rev(ys), baseRhs, baseLeft, symm(list, baseRhs, rev(ys), baseRight));

  const singleton = cons(x, nil);
  const consXs = cons(x, xs);
  const lhs = rev(append(consXs, ys));
  const afterAppend = rev(cons(x, append(xs, ys)));
  const afterRev = append(rev(append(xs, ys)), singleton);
  const afterIH = append(append(rev(ys), rev(xs)), singleton);
  const common = append(rev(ys), append(rev(xs), singleton));
  const rhs = append(rev(ys), rev(consXs));
  const leftChain = trans(
    list, lhs, afterAppend, common,
    congr(list, list, apps(c("rev"), A), append(consXs, ys), cons(x, append(xs, ys)), apps(c("append_cons_left"), A, x, xs, ys)),
    trans(
      list, afterAppend, afterRev, common, apps(c("rev_cons"), A, x, append(xs, ys)),
      trans(
        list, afterRev, afterIH, common,
        congr(list, list, lambda("front", list, append(v("front"), singleton)), rev(append(xs, ys)), append(rev(ys), rev(xs)), ih),
        apps(c("append_assoc"), A, rev(ys), rev(xs), singleton),
      ),
    ),
  );
  const rightToCommon = congr(
    list, list, lambda("tail", list, append(rev(ys), v("tail"))),
    rev(consXs), append(rev(xs), singleton), apps(c("rev_cons"), A, x, xs),
  );
  const step = lambda("x", A, lambda("xs", list, lambda("ih", proposition(xs),
    trans(list, lhs, common, rhs, leftChain, symm(list, rhs, common, rightToCommon)))));
  const motive = lambda("xs", list, proposition(v("xs")));
  return {
    type: pis([["A", type(0)], ["xs", list], ["ys", list]], proposition(v("xs"))),
    term: lambdas([["A", type(0)], ["xs", list], ["ys", list]], apps(c("list_induction"), A, motive, base, step, v("xs"))),
  };
}

export function revInvolutionProof(): { readonly type: Term; readonly term: Term } {
  const A = v("A");
  const list = listType(A);
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const nil = nilAt(A);
  const cons = (head: Term, rest: Term): Term => consAt(A, head, rest);
  const rev = (value: Term): Term => apps(c("rev"), A, value);
  const append = (left: Term, right: Term): Term => apps(c("append"), A, left, right);
  const proposition = (value: Term): Term => equal(list, rev(rev(value)), value);
  const base = trans(
    list, rev(rev(nil)), rev(nil), nil,
    congr(list, list, apps(c("rev"), A), rev(nil), nil, apps(c("rev_nil"), A)), apps(c("rev_nil"), A),
  );
  const singleton = cons(x, nil);
  const consXs = cons(x, xs);
  const lhs = rev(rev(consXs));
  const afterInner = rev(append(rev(xs), singleton));
  const afterRevAppend = append(rev(singleton), rev(rev(xs)));
  const afterSingleton = append(singleton, rev(rev(xs)));
  const afterIH = append(singleton, xs);
  const common = consXs;
  const singletonProof = trans(
    list, rev(singleton), append(rev(nil), singleton), singleton,
    apps(c("rev_cons"), A, x, nil),
    trans(
      list, append(rev(nil), singleton), append(nil, singleton), singleton,
      congr(list, list, lambda("front", list, append(v("front"), singleton)), rev(nil), nil, apps(c("rev_nil"), A)),
      apps(c("append_nil_left"), A, singleton),
    ),
  );
  const chain = trans(
    list, lhs, afterInner, common,
    congr(list, list, apps(c("rev"), A), rev(consXs), append(rev(xs), singleton), apps(c("rev_cons"), A, x, xs)),
    trans(
      list, afterInner, afterRevAppend, common, apps(c("rev_append"), A, rev(xs), singleton),
      trans(
        list, afterRevAppend, afterSingleton, common,
        congr(list, list, lambda("front", list, append(v("front"), rev(rev(xs)))), rev(singleton), singleton, singletonProof),
        trans(
          list, afterSingleton, afterIH, common,
          congr(list, list, lambda("tail", list, append(singleton, v("tail"))), rev(rev(xs)), xs, ih),
          trans(
            list, afterIH, cons(x, append(nil, xs)), common,
            apps(c("append_cons_left"), A, x, nil, xs),
            congr(list, list, lambda("tail", list, cons(x, v("tail"))), append(nil, xs), xs, apps(c("append_nil_left"), A, xs)),
          ),
        ),
      ),
    ),
  );
  const step = lambda("x", A, lambda("xs", list, lambda("ih", proposition(xs), chain)));
  const motive = lambda("xs", list, proposition(v("xs")));
  return {
    type: pis([["A", type(0)], ["xs", list]], proposition(v("xs"))),
    term: lambdas([["A", type(0)]], apps(c("list_induction"), A, motive, base, step)),
  };
}

/**
 * The propositional opening lessons as hand-assembled λ-terms. Propositions
 * quantify over the predicative `Type 0` (displayed as Prop); implication is
 * Π, conjunction is the `and` inductive, and no axioms are involved.
 */
export function propIdentityProof(): { readonly type: Term; readonly term: Term } {
  const P = v("P");
  return {
    type: pi("P", type(0), arrow(P, P)),
    term: lambda("P", type(0), lambda("h", P, v("h"))),
  };
}

export function propAndLeftProof(): { readonly type: Term; readonly term: Term } {
  const P = v("P");
  const Q = v("Q");
  const andPQ = apps(c("and"), P, Q);
  return {
    type: pis([["P", type(0)], ["Q", type(0)]], arrow(andPQ, P)),
    term: lambda("P", type(0), lambda("Q", type(0), lambda("h", andPQ,
      recursor("and", lambda("_", andPQ, P), [lambda("a", P, lambda("b", Q, v("a")))], v("h"), [P, Q])))),
  };
}

export function propConstProof(): { readonly type: Term; readonly term: Term } {
  const P = v("P");
  const Q = v("Q");
  return {
    type: pis([["P", type(0)], ["Q", type(0)]], arrow(P, arrow(Q, P))),
    term: lambda("P", type(0), lambda("Q", type(0), lambda("h", P, lambda("h2", Q, v("h"))))),
  };
}

export function propAndSwapProof(): { readonly type: Term; readonly term: Term } {
  const P = v("P");
  const Q = v("Q");
  const andPQ = apps(c("and"), P, Q);
  const andQP = apps(c("and"), Q, P);
  return {
    type: pis([["P", type(0)], ["Q", type(0)]], arrow(andPQ, andQP)),
    term: lambda("P", type(0), lambda("Q", type(0), lambda("h", andPQ,
      recursor("and", lambda("_", andPQ, andQP), [
        lambda("a", P, lambda("b", Q, apps(c("conj"), Q, P, v("b"), v("a")))),
      ], v("h"), [P, Q])))),
  };
}

export function verifyLessonProof(lessonId: string): void {
  const environment = touchProofEnvironment();
  const builders: Readonly<Record<string, () => { readonly type: Term; readonly term: Term }>> = {
    "prop-identity": propIdentityProof,
    "prop-and-left": propAndLeftProof,
    "prop-const": propConstProof,
    "prop-and-swap": propAndSwapProof,
    "bool-compute": booleanComputationProof,
    "bool-involution": booleanInvolutionProof,
    "nat-add-example": natAdditionExampleProof,
    "nat-add-zero": addZeroRightProof,
    "list-append-nil": appendNilRightProof,
    "list-map-append": mapAppendProof,
    "list-rev-append": revAppendProof,
    "list-rev-involution": revInvolutionProof,
    "map-composition": mapCompositionProof,
    "nat-add-succ-right": addSuccRightProof,
    "nat-add-assoc": addAssocProof,
    "nat-add-comm": addCommProof,
    "list-length-append": lengthAppendProof,
    "list-length-rev": lengthRevProof,
    "list-map-length": mapLengthProof,
  };
  const build = builders[lessonId];
  if (build === undefined) throw new Error(`no kernel certificate for lesson ${lessonId}`);
  const theorem = build();
  check(theorem.term, theorem.type, new Map(), environment);
}
