"use client";

import type { OperatorFixity, ProgramExpr, ProofMove } from "@touchproof/core";
import { operatorByName } from "@touchproof/core";
import { expressionShape, needsParens, type InfixSide } from "@/lib/programDoc";
import { dropMove, movesForHandle } from "@/lib/viewModel";
import { useSelection } from "./selectionContext";

// The DOM view renders every node as a tappable span (no [x] list sugar), so
// cons stays a binary operator for parenthesization purposes.
const DOM_SHAPE = { listLiterals: false } as const;

export interface ExpressionProps {
  expression: ProgramExpr;
  moves: readonly ProofMove[];
  onMove: (moveId: string) => void;
}

/** An operand of an infix operator: parenthesized by the same shared
 * minimal-parens rule the pretty-printer uses, so the two surfaces agree. */
function ExprOperand({ expression, moves, onMove, parent, side }: ExpressionProps & { parent: OperatorFixity; side: InfixSide }) {
  const wrap = needsParens(expression, parent, side);
  return (
    <>
      {wrap && <span className="paren">(</span>}
      <Expression expression={expression} moves={moves} onMove={onMove} />
      {wrap && <span className="paren">)</span>}
    </>
  );
}

/** An argument of a juxtaposed application: everything but atoms is wrapped.
 * The .argument span provides the spacing; no space characters means the
 * head can never be split from its argument by line wrapping. */
function ExprArgument({ expression, moves, onMove }: ExpressionProps) {
  const wrap = expressionShape(expression, DOM_SHAPE) !== "atom";
  return (
    <span className="argument">
      {wrap && <span className="paren">(</span>}
      <Expression expression={expression} moves={moves} onMove={onMove} />
      {wrap && <span className="paren">)</span>}
    </span>
  );
}

// Exported for tests: the parenthesization stays in lockstep with the
// pretty-printer because both drive the infix path off the fixity table and
// share the one needsParens decision.
export function Expression({ expression, moves, onMove }: ExpressionProps) {
  const selection = useSelection();
  const fromHere = movesForHandle(moves, expression.id);
  const isDropTarget = moves.some((move) => move.dropTarget === expression.id);

  // One table-driven infix path: the fixity table supplies the spelling and,
  // via the shared needsParens, the side-aware minimal parens. Breakable space
  // BEFORE the operator, NBSP after, so a wrapped operator starts the next line.
  const infix = (operator: OperatorFixity, left: ProgramExpr, right: ProgramExpr) => (
    <>
      <ExprOperand expression={left} moves={moves} onMove={onMove} parent={operator} side="left" />
      <span className="operator">{` ${operator.symbol}\u00A0`}</span>
      <ExprOperand expression={right} moves={moves} onMove={onMove} parent={operator} side="right" />
    </>
  );

  const content = (() => {
    if (expression.kind === "var") return expression.name;
    if (expression.kind === "ctor") {
      if (expression.name === "nil") return "[]";
      if (expression.name === "zero") return "0";
      if (expression.name === "succ" && expression.args.length === 1) {
        return <><span className="function-name">S</span><ExprArgument expression={expression.args[0]!} moves={moves} onMove={onMove} /></>;
      }
      const constructorOperator = expression.args.length === 2 ? operatorByName(expression.name) : undefined;
      if (constructorOperator !== undefined) return infix(constructorOperator, expression.args[0]!, expression.args[1]!);
      return <>{expression.name}{expression.args.map((arg) => <ExprArgument key={arg.id} expression={arg} moves={moves} onMove={onMove} />)}</>;
    }
    const operator = expression.args.length === 2 ? operatorByName(expression.name) : undefined;
    if (operator !== undefined) return infix(operator, expression.args[0]!, expression.args[1]!);
    if (expression.name === "apply" && expression.args.length === 2) {
      const fn = expression.args[0]!;
      const wrapHead = expressionShape(fn, DOM_SHAPE) === "binary";
      return <>{wrapHead && <span className="paren">(</span>}<Expression expression={fn} moves={moves} onMove={onMove} />{wrapHead && <span className="paren">)</span>}<ExprArgument expression={expression.args[1]!} moves={moves} onMove={onMove} /></>;
    }
    return <><span className="function-name">{expression.name}</span>{expression.args.map((arg) => <ExprArgument key={arg.id} expression={arg} moves={moves} onMove={onMove} />)}</>;
  })();

  return (
    <span
      className={`expression ${fromHere.length > 0 ? "movable tappable" : ""} ${selection.selectedHandle === expression.id ? "selected" : ""} ${isDropTarget ? "drop-target" : ""} ${selection.previewHandle === expression.id ? "preview-target" : ""} ${selection.previewTarget === expression.id ? "preview-dest" : ""}`}
      draggable={fromHere.length > 0}
      role={fromHere.length === 0 ? undefined : "button"}
      tabIndex={fromHere.length === 0 ? undefined : 0}
      title={fromHere.length === 0 ? undefined : "Click for proof actions, or drag to a highlighted target"}
      onClick={(event) => {
        if (fromHere.length === 0) return;
        event.stopPropagation();
        selection.select(
          selection.selectedHandle === expression.id ? undefined : expression.id,
          { x: event.clientX, y: event.clientY },
        );
      }}
      onKeyDown={(event) => {
        if (fromHere.length > 0 && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          selection.select(expression.id, { x: bounds.right, y: bounds.bottom });
        }
      }}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("application/x-touchproof-handle", expression.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        const types = Array.from(event.dataTransfer.types);
        if (isDropTarget && types.includes("application/x-touchproof-handle")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const handle = event.dataTransfer.getData("application/x-touchproof-handle");
        const move = dropMove(moves, handle, expression.id);
        if (move !== undefined) onMove(move.id);
      }}
    >
      {content}
    </span>
  );
}
