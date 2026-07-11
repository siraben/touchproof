import {
  applyProofMove,
  createLessonSession,
  enumerateProofMoves,
  focusGoal,
  lessonCatalog,
  type ProofSession,
} from "@touchproof/core";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function response(session: ProofSession) {
  return NextResponse.json({ session, moves: enumerateProofMoves(session), lessons: lessonCatalog });
}

function isProofSession(value: unknown): value is ProofSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ProofSession>;
  return typeof candidate.lessonId === "string"
    && lessonCatalog.some((lesson) => lesson.id === candidate.lessonId)
    && typeof candidate.theorem === "string"
    && typeof candidate.statement === "string"
    && typeof candidate.focusedGoalId === "string"
    && (candidate.kernelStatus === "pending" || candidate.kernelStatus === "checked")
    && Array.isArray(candidate.definitionNames)
    && candidate.definitionNames.every((name) => typeof name === "string")
    && Array.isArray(candidate.inductiveNames)
    && candidate.inductiveNames.every((name) => typeof name === "string")
    && Array.isArray(candidate.goals)
    && candidate.goals.length > 0
    && candidate.goals.length <= 8
    && candidate.goals.every((goal) => typeof goal === "object" && goal !== null
      && typeof goal.id === "string" && (goal.status === "open" || goal.status === "solved")
      && typeof goal.left === "object" && goal.left !== null
      && typeof goal.right === "object" && goal.right !== null);
}

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("lesson") ?? lessonCatalog[0]!.id;
  const lessonId = lessonCatalog.some((lesson) => lesson.id === requested) ? requested : lessonCatalog[0]!.id;
  return response(createLessonSession(lessonId));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      session?: ProofSession;
      moveId?: string;
      focusGoalId?: string;
      inspect?: boolean;
    };
    if (!isProofSession(body.session)) throw new Error("invalid proof document");
    if (JSON.stringify(body.session).length > 200_000) throw new Error("proof document is too large");
    if (body.moveId !== undefined) return response(applyProofMove(body.session, body.moveId));
    if (body.focusGoalId !== undefined) return response(focusGoal(body.session, body.focusGoalId));
    if (body.inspect === true) return response(body.session);
    throw new Error("missing proof action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid proof request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
