import {
  applyProofMove,
  createMapCompositionSession,
  enumerateProofMoves,
  focusGoal,
  type ProofSession,
} from "@touchproof/core";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function response(session: ProofSession) {
  return NextResponse.json({ session, moves: enumerateProofMoves(session) });
}

export async function GET() {
  return response(createMapCompositionSession());
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      session?: ProofSession;
      moveId?: string;
      focusGoalId?: string;
    };
    if (body.session === undefined) throw new Error("missing proof session");
    if (body.moveId !== undefined) return response(applyProofMove(body.session, body.moveId));
    if (body.focusGoalId !== undefined) return response(focusGoal(body.session, body.focusGoalId));
    throw new Error("missing proof action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid proof request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
