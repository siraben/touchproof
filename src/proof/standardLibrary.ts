import { check, type Environment } from "../kernel/checker.js";
import {
  app,
  apps,
  arrow,
  constant,
  equal,
  lambda,
  pi,
  type,
  variable,
  type Term,
} from "../kernel/term.js";

const c = constant;
const v = variable;

function pis(bindings: ReadonlyArray<readonly [string, Term]>, result: Term): Term {
  return bindings.reduceRight((body, [name, domain]) => pi(name, domain, body), result);
}

export function touchProofEnvironment(): Environment {
  const env = new Map<string, { type: Term }>();
  const declare = (name: string, declarationType: Term): void => {
    env.set(name, { type: declarationType });
  };

  declare("Elem", type(0));
  declare("Bool", type(0));
  declare("true", c("Bool"));
  declare("false", c("Bool"));
  declare("negb", arrow(c("Bool"), c("Bool")));
  declare("negb_true", equal(c("Bool"), app(c("negb"), c("true")), c("false")));
  declare("negb_false", equal(c("Bool"), app(c("negb"), c("false")), c("true")));
  declare("bool_induction", pis([
    ["P", arrow(c("Bool"), type(0))],
    ["trueCase", app(v("P"), c("true"))],
    ["falseCase", app(v("P"), c("false"))],
    ["b", c("Bool")],
  ], app(v("P"), v("b"))));

  declare("Nat", type(0));
  declare("zero", c("Nat"));
  declare("succ", arrow(c("Nat"), c("Nat")));
  declare("add", pis([["left", c("Nat")], ["right", c("Nat")]], c("Nat")));
  declare("add_zero_left", pis([["m", c("Nat")]],
    equal(c("Nat"), apps(c("add"), c("zero"), v("m")), v("m"))));
  declare("add_succ_left", pis([["n", c("Nat")], ["m", c("Nat")]], equal(
    c("Nat"),
    apps(c("add"), app(c("succ"), v("n")), v("m")),
    app(c("succ"), apps(c("add"), v("n"), v("m"))),
  )));
  declare("nat_induction", pis([
    ["P", arrow(c("Nat"), type(0))],
    ["zeroCase", app(v("P"), c("zero"))],
    ["succCase", pis([
      ["n", c("Nat")], ["ih", app(v("P"), v("n"))],
    ], app(v("P"), app(c("succ"), v("n"))))],
    ["n", c("Nat")],
  ], app(v("P"), v("n"))));

  declare("List", type(0));
  declare("nil", c("List"));
  declare("cons", pis([["head", c("Elem")], ["tail", c("List")]], c("List")));
  declare("map", pis([
    ["f", arrow(c("Elem"), c("Elem"))],
    ["xs", c("List")],
  ], c("List")));
  declare("compose", pis([
    ["f", arrow(c("Elem"), c("Elem"))],
    ["g", arrow(c("Elem"), c("Elem"))],
    ["x", c("Elem")],
  ], c("Elem")));

  declare("map_nil", pis([["f", arrow(c("Elem"), c("Elem"))]],
    equal(c("List"), apps(c("map"), v("f"), c("nil")), c("nil"))));
  declare("map_cons", pis([
    ["f", arrow(c("Elem"), c("Elem"))],
    ["x", c("Elem")],
    ["xs", c("List")],
  ], equal(
    c("List"),
    apps(c("map"), v("f"), apps(c("cons"), v("x"), v("xs"))),
    apps(c("cons"), app(v("f"), v("x")), apps(c("map"), v("f"), v("xs"))),
  )));
  declare("append", pis([["left", c("List")], ["right", c("List")]], c("List")));
  declare("append_nil_left", pis([["ys", c("List")]],
    equal(c("List"), apps(c("append"), c("nil"), v("ys")), v("ys"))));
  declare("append_cons_left", pis([
    ["x", c("Elem")], ["xs", c("List")], ["ys", c("List")],
  ], equal(
    c("List"),
    apps(c("append"), apps(c("cons"), v("x"), v("xs")), v("ys")),
    apps(c("cons"), v("x"), apps(c("append"), v("xs"), v("ys"))),
  )));
  declare("append_nil_right", pis([["xs", c("List")]],
    equal(c("List"), apps(c("append"), v("xs"), c("nil")), v("xs"))));
  declare("append_assoc", pis([
    ["xs", c("List")], ["ys", c("List")], ["zs", c("List")],
  ], equal(
    c("List"),
    apps(c("append"), apps(c("append"), v("xs"), v("ys")), v("zs")),
    apps(c("append"), v("xs"), apps(c("append"), v("ys"), v("zs"))),
  )));
  declare("rev", arrow(c("List"), c("List")));
  declare("rev_nil", equal(c("List"), app(c("rev"), c("nil")), c("nil")));
  declare("rev_cons", pis([["x", c("Elem")], ["xs", c("List")]], equal(
    c("List"),
    app(c("rev"), apps(c("cons"), v("x"), v("xs"))),
    apps(c("append"), app(c("rev"), v("xs")), apps(c("cons"), v("x"), c("nil"))),
  )));
  declare("rev_append", pis([["xs", c("List")], ["ys", c("List")]], equal(
    c("List"),
    app(c("rev"), apps(c("append"), v("xs"), v("ys"))),
    apps(c("append"), app(c("rev"), v("ys")), app(c("rev"), v("xs"))),
  )));
  declare("compose_apply", pis([
    ["f", arrow(c("Elem"), c("Elem"))],
    ["g", arrow(c("Elem"), c("Elem"))],
    ["x", c("Elem")],
  ], equal(
    c("Elem"),
    apps(c("compose"), v("f"), v("g"), v("x")),
    app(v("f"), app(v("g"), v("x"))),
  )));

  declare("eq_symm", pis([
    ["A", type(0)], ["x", v("A")], ["y", v("A")],
    ["proof", equal(v("A"), v("x"), v("y"))],
  ], equal(v("A"), v("y"), v("x"))));
  declare("eq_trans", pis([
    ["A", type(0)], ["x", v("A")], ["y", v("A")], ["z", v("A")],
    ["left", equal(v("A"), v("x"), v("y"))],
    ["right", equal(v("A"), v("y"), v("z"))],
  ], equal(v("A"), v("x"), v("z"))));
  declare("congr_arg", pis([
    ["A", type(0)], ["B", type(0)], ["f", arrow(v("A"), v("B"))],
    ["x", v("A")], ["y", v("A")], ["proof", equal(v("A"), v("x"), v("y"))],
  ], equal(v("B"), app(v("f"), v("x")), app(v("f"), v("y")))));

  const predicate = v("P");
  declare("list_induction", pis([
    ["P", arrow(c("List"), type(0))],
    ["nilCase", app(predicate, c("nil"))],
    ["consCase", pis([
      ["x", c("Elem")], ["xs", c("List")], ["ih", app(predicate, v("xs"))],
    ], app(predicate, apps(c("cons"), v("x"), v("xs"))))],
    ["xs", c("List")],
  ], app(predicate, v("xs"))));

  return env;
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

/** Kernel proof term behind the visual map-composition walkthrough. */
export function mapCompositionProof(): { readonly type: Term; readonly term: Term } {
  const elem = c("Elem");
  const list = c("List");
  const fn = arrow(elem, elem);
  const f = v("f");
  const g = v("g");
  const xs = v("xs");
  const x = v("x");
  const ih = v("ih");
  const composed = apps(c("compose"), f, g);
  const mappedComposition = (value: Term): Term => apps(c("map"), composed, value);
  const mappedTwice = (value: Term): Term => apps(c("map"), f, apps(c("map"), g, value));
  const proposition = (value: Term): Term => equal(list, mappedComposition(value), mappedTwice(value));
  const motive = lambda("value", list, proposition(v("value")));

  const lhsNil = mappedComposition(c("nil"));
  const rhsNil = mappedTwice(c("nil"));
  const mapFNil = apps(c("map"), f, c("nil"));
  const rhsNilToMapFNil = congr(
    list, list, apps(c("map"), f), apps(c("map"), g, c("nil")), c("nil"), apps(c("map_nil"), g),
  );
  const rhsNilToNil = trans(list, rhsNil, mapFNil, c("nil"), rhsNilToMapFNil, apps(c("map_nil"), f));
  const nilCase = trans(
    list,
    lhsNil,
    c("nil"),
    rhsNil,
    apps(c("map_nil"), composed),
    symm(list, rhsNil, c("nil"), rhsNilToNil),
  );

  const consXs = apps(c("cons"), x, xs);
  const lhs = mappedComposition(consXs);
  const composedX = app(composed, x);
  const fgX = app(f, app(g, x));
  const mapComposedXs = mappedComposition(xs);
  const mapTwiceXs = mappedTwice(xs);
  const afterMapCons = apps(c("cons"), composedX, mapComposedXs);
  const afterHead = apps(c("cons"), fgX, mapComposedXs);
  const common = apps(c("cons"), fgX, mapTwiceXs);
  const rhs = mappedTwice(consXs);

  const headStep = congr(
    elem,
    list,
    lambda("head", elem, apps(c("cons"), v("head"), mapComposedXs)),
    composedX,
    fgX,
    apps(c("compose_apply"), f, g, x),
  );
  const tailStep = congr(
    list,
    list,
    lambda("tail", list, apps(c("cons"), fgX, v("tail"))),
    mapComposedXs,
    mapTwiceXs,
    ih,
  );
  const mapGCons = apps(c("map_cons"), g, x, xs);
  const rhsToMapFCons = congr(
    list,
    list,
    apps(c("map"), f),
    apps(c("map"), g, consXs),
    apps(c("cons"), app(g, x), apps(c("map"), g, xs)),
    mapGCons,
  );
  const rhsToCommon = trans(
    list,
    rhs,
    apps(c("map"), f, apps(c("cons"), app(g, x), apps(c("map"), g, xs))),
    common,
    rhsToMapFCons,
    apps(c("map_cons"), f, app(g, x), apps(c("map"), g, xs)),
  );
  const consCaseBody = trans(
    list,
    lhs,
    afterMapCons,
    rhs,
    apps(c("map_cons"), composed, x, xs),
    trans(
      list,
      afterMapCons,
      afterHead,
      rhs,
      headStep,
      trans(list, afterHead, common, rhs, tailStep, symm(list, rhs, common, rhsToCommon)),
    ),
  );
  const consCase = lambda("x", elem, lambda("xs", list, lambda("ih", proposition(xs), consCaseBody)));

  const theoremType = pi("f", fn, pi("g", fn, pi("xs", list, proposition(xs))));
  const proof = lambda(
    "f",
    fn,
    lambda("g", fn, apps(c("list_induction"), motive, nilCase, consCase)),
  );
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

export function appendNilRightProof(): { readonly type: Term; readonly term: Term } {
  const list = c("List");
  const proposition = (value: Term): Term => equal(list, apps(c("append"), value, c("nil")), value);
  const motive = lambda("xs", list, proposition(v("xs")));
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const consXs = apps(c("cons"), x, xs);
  const successorCase = lambda("x", c("Elem"), lambda("xs", list, lambda("ih", proposition(xs), trans(
    list,
    apps(c("append"), consXs, c("nil")),
    apps(c("cons"), x, apps(c("append"), xs, c("nil"))),
    consXs,
    apps(c("append_cons_left"), x, xs, c("nil")),
    congr(
      list,
      list,
      lambda("tail", list, apps(c("cons"), x, v("tail"))),
      apps(c("append"), xs, c("nil")),
      xs,
      ih,
    ),
  ))));
  return {
    type: pi("xs", list, proposition(v("xs"))),
    term: apps(c("list_induction"), motive, apps(c("append_nil_left"), c("nil")), successorCase),
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
  const list = c("List");
  const fnType = arrow(c("Elem"), c("Elem"));
  const f = v("f");
  const ys = v("ys");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const mapF = apps(c("map"), f);
  const proposition = (value: Term): Term => equal(
    list,
    apps(c("map"), f, apps(c("append"), value, ys)),
    apps(c("append"), apps(c("map"), f, value), apps(c("map"), f, ys)),
  );
  const mapFYs = apps(c("map"), f, ys);
  const baseLeft = apps(c("map"), f, apps(c("append"), c("nil"), ys));
  const baseRight = apps(c("append"), apps(c("map"), f, c("nil")), mapFYs);
  const leftToCommon = congr(list, list, mapF, apps(c("append"), c("nil"), ys), ys, apps(c("append_nil_left"), ys));
  const rightToAppendNil = congr(
    list, list, lambda("head", list, apps(c("append"), v("head"), mapFYs)),
    apps(c("map"), f, c("nil")), c("nil"), apps(c("map_nil"), f),
  );
  const baseRightToCommon = trans(
    list, baseRight, apps(c("append"), c("nil"), mapFYs), mapFYs,
    rightToAppendNil, apps(c("append_nil_left"), mapFYs),
  );
  const base = trans(list, baseLeft, mapFYs, baseRight, leftToCommon, symm(list, baseRight, mapFYs, baseRightToCommon));

  const consXs = apps(c("cons"), x, xs);
  const appended = apps(c("append"), xs, ys);
  const lhs = apps(c("map"), f, apps(c("append"), consXs, ys));
  const afterAppend = apps(c("map"), f, apps(c("cons"), x, appended));
  const afterMap = apps(c("cons"), app(f, x), apps(c("map"), f, appended));
  const common = apps(c("cons"), app(f, x), apps(c("append"), apps(c("map"), f, xs), mapFYs));
  const rhs = apps(c("append"), apps(c("map"), f, consXs), mapFYs);
  const rhsAfterMap = apps(c("append"), apps(c("cons"), app(f, x), apps(c("map"), f, xs)), mapFYs);
  const leftChain = trans(
    list, lhs, afterAppend, common,
    congr(list, list, mapF, apps(c("append"), consXs, ys), apps(c("cons"), x, appended), apps(c("append_cons_left"), x, xs, ys)),
    trans(
      list, afterAppend, afterMap, common,
      apps(c("map_cons"), f, x, appended),
      congr(
        list, list, lambda("tail", list, apps(c("cons"), app(f, x), v("tail"))),
        apps(c("map"), f, appended), apps(c("append"), apps(c("map"), f, xs), mapFYs), ih,
      ),
    ),
  );
  const rightToCommon = trans(
    list, rhs, rhsAfterMap, common,
    congr(
      list, list, lambda("front", list, apps(c("append"), v("front"), mapFYs)),
      apps(c("map"), f, consXs), apps(c("cons"), app(f, x), apps(c("map"), f, xs)), apps(c("map_cons"), f, x, xs),
    ),
    apps(c("append_cons_left"), app(f, x), apps(c("map"), f, xs), mapFYs),
  );
  const step = lambda("x", c("Elem"), lambda("xs", list, lambda("ih", proposition(xs),
    trans(list, lhs, common, rhs, leftChain, symm(list, rhs, common, rightToCommon)))));
  const motive = lambda("xs", list, proposition(v("xs")));
  return {
    type: pi("f", fnType, pi("ys", list, pi("xs", list, proposition(v("xs"))))),
    term: lambda("f", fnType, lambda("ys", list, apps(c("list_induction"), motive, base, step))),
  };
}

export function revAppendProof(): { readonly type: Term; readonly term: Term } {
  const list = c("List");
  const ys = v("ys");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const rev = (value: Term): Term => app(c("rev"), value);
  const append = (left: Term, right: Term): Term => apps(c("append"), left, right);
  const proposition = (value: Term): Term => equal(list, rev(append(value, ys)), append(rev(ys), rev(value)));
  const baseLhs = rev(append(c("nil"), ys));
  const baseRhs = append(rev(ys), rev(c("nil")));
  const baseLeft = congr(list, list, c("rev"), append(c("nil"), ys), ys, apps(c("append_nil_left"), ys));
  const baseRight = trans(
    list, baseRhs, append(rev(ys), c("nil")), rev(ys),
    congr(list, list, lambda("tail", list, append(rev(ys), v("tail"))), rev(c("nil")), c("nil"), c("rev_nil")),
    apps(c("append_nil_right"), rev(ys)),
  );
  const base = trans(list, baseLhs, rev(ys), baseRhs, baseLeft, symm(list, baseRhs, rev(ys), baseRight));

  const singleton = apps(c("cons"), x, c("nil"));
  const consXs = apps(c("cons"), x, xs);
  const lhs = rev(append(consXs, ys));
  const afterAppend = rev(apps(c("cons"), x, append(xs, ys)));
  const afterRev = append(rev(append(xs, ys)), singleton);
  const afterIH = append(append(rev(ys), rev(xs)), singleton);
  const common = append(rev(ys), append(rev(xs), singleton));
  const rhs = append(rev(ys), rev(consXs));
  const leftChain = trans(
    list, lhs, afterAppend, common,
    congr(list, list, c("rev"), append(consXs, ys), apps(c("cons"), x, append(xs, ys)), apps(c("append_cons_left"), x, xs, ys)),
    trans(
      list, afterAppend, afterRev, common, apps(c("rev_cons"), x, append(xs, ys)),
      trans(
        list, afterRev, afterIH, common,
        congr(list, list, lambda("front", list, append(v("front"), singleton)), rev(append(xs, ys)), append(rev(ys), rev(xs)), ih),
        apps(c("append_assoc"), rev(ys), rev(xs), singleton),
      ),
    ),
  );
  const rightToCommon = congr(
    list, list, lambda("tail", list, append(rev(ys), v("tail"))),
    rev(consXs), append(rev(xs), singleton), apps(c("rev_cons"), x, xs),
  );
  const step = lambda("x", c("Elem"), lambda("xs", list, lambda("ih", proposition(xs),
    trans(list, lhs, common, rhs, leftChain, symm(list, rhs, common, rightToCommon)))));
  const motive = lambda("xs", list, proposition(v("xs")));
  return {
    type: pi("ys", list, pi("xs", list, proposition(v("xs")))),
    term: lambda("ys", list, apps(c("list_induction"), motive, base, step)),
  };
}

export function revInvolutionProof(): { readonly type: Term; readonly term: Term } {
  const list = c("List");
  const x = v("x");
  const xs = v("xs");
  const ih = v("ih");
  const rev = (value: Term): Term => app(c("rev"), value);
  const append = (left: Term, right: Term): Term => apps(c("append"), left, right);
  const proposition = (value: Term): Term => equal(list, rev(rev(value)), value);
  const base = trans(
    list, rev(rev(c("nil"))), rev(c("nil")), c("nil"),
    congr(list, list, c("rev"), rev(c("nil")), c("nil"), c("rev_nil")), c("rev_nil"),
  );
  const singleton = apps(c("cons"), x, c("nil"));
  const consXs = apps(c("cons"), x, xs);
  const lhs = rev(rev(consXs));
  const afterInner = rev(append(rev(xs), singleton));
  const afterRevAppend = append(rev(singleton), rev(rev(xs)));
  const afterSingleton = append(singleton, rev(rev(xs)));
  const afterIH = append(singleton, xs);
  const common = consXs;
  const singletonProof = trans(
    list, rev(singleton), append(rev(c("nil")), singleton), singleton,
    apps(c("rev_cons"), x, c("nil")),
    trans(
      list, append(rev(c("nil")), singleton), append(c("nil"), singleton), singleton,
      congr(list, list, lambda("front", list, append(v("front"), singleton)), rev(c("nil")), c("nil"), c("rev_nil")),
      apps(c("append_nil_left"), singleton),
    ),
  );
  const chain = trans(
    list, lhs, afterInner, common,
    congr(list, list, c("rev"), rev(consXs), append(rev(xs), singleton), apps(c("rev_cons"), x, xs)),
    trans(
      list, afterInner, afterRevAppend, common, apps(c("rev_append"), rev(xs), singleton),
      trans(
        list, afterRevAppend, afterSingleton, common,
        congr(list, list, lambda("front", list, append(v("front"), rev(rev(xs)))), rev(singleton), singleton, singletonProof),
        trans(
          list, afterSingleton, afterIH, common,
          congr(list, list, lambda("tail", list, append(singleton, v("tail"))), rev(rev(xs)), xs, ih),
          trans(
            list, afterIH, apps(c("cons"), x, append(c("nil"), xs)), common,
            apps(c("append_cons_left"), x, c("nil"), xs),
            congr(list, list, lambda("tail", list, apps(c("cons"), x, v("tail"))), append(c("nil"), xs), xs, apps(c("append_nil_left"), xs)),
          ),
        ),
      ),
    ),
  );
  const step = lambda("x", c("Elem"), lambda("xs", list, lambda("ih", proposition(xs), chain)));
  const motive = lambda("xs", list, proposition(v("xs")));
  return {
    type: pi("xs", list, proposition(v("xs"))),
    term: apps(c("list_induction"), motive, base, step),
  };
}

export function verifyLessonProof(lessonId: string): void {
  const environment = touchProofEnvironment();
  const builders: Readonly<Record<string, () => { readonly type: Term; readonly term: Term }>> = {
    "bool-compute": booleanComputationProof,
    "bool-involution": booleanInvolutionProof,
    "nat-add-example": natAdditionExampleProof,
    "nat-add-zero": addZeroRightProof,
    "list-append-nil": appendNilRightProof,
    "list-map-append": mapAppendProof,
    "list-rev-append": revAppendProof,
    "list-rev-involution": revInvolutionProof,
    "map-composition": mapCompositionProof,
  };
  const build = builders[lessonId];
  if (build === undefined) throw new Error(`no kernel certificate for lesson ${lessonId}`);
  const theorem = build();
  check(theorem.term, theorem.type, new Map(), environment);
}
