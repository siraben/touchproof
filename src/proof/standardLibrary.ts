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
