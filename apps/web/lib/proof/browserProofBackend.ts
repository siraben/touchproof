import {
  applyProofMove,
  checkProofSession,
  createLessonSession,
  decodeProofSession,
  enumerateProofMoves,
  focusGoal,
  lessonCatalog,
  markKernelChecked,
  type KernelCertificate,
  type Lesson,
  type ProofMove,
  type ProofSession,
} from "@touchproof/core";

export interface CheckEvidence {
  readonly status: "validated";
  readonly scope: "transitions" | "completed-theorem";
  readonly sourceHash: string;
  readonly kernel: "TouchProof DTT 0.1";
  readonly elapsedMs: number;
}

export interface ProofSnapshot {
  readonly session: ProofSession;
  readonly moves: readonly ProofMove[];
  readonly lessons: readonly Lesson[];
  readonly script: string;
  readonly kernelVersion: "TouchProof DTT 0.1";
  readonly evidence: CheckEvidence;
}

export type ProofAction =
  | { readonly kind: "apply-move"; readonly moveId: string }
  | { readonly kind: "focus-goal"; readonly goalId: string };

export type ProgressListener = (progress: Readonly<{ phase: "checking" }>) => void;

export interface KernelPort {
  check(value: unknown): KernelCertificate;
}

const localKernel: KernelPort = { check: checkProofSession };

async function sha256(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class BrowserProofBackend {
  private sequence: Promise<void> = Promise.resolve();

  constructor(private readonly kernel: KernelPort = localKernel) {}

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  startLesson(lessonId: string, onProgress?: ProgressListener): Promise<ProofSnapshot> {
    const known = lessonCatalog.some((lesson) => lesson.id === lessonId) ? lessonId : lessonCatalog[0]!.id;
    return this.enqueue(() => this.certify(createLessonSession(known), onProgress));
  }

  restore(document: unknown, onProgress?: ProgressListener): Promise<ProofSnapshot> {
    return this.enqueue(() => this.certify(decodeProofSession(document), onProgress));
  }

  dispatch(document: unknown, action: ProofAction, onProgress?: ProgressListener): Promise<ProofSnapshot> {
    return this.enqueue(() => {
      const session = decodeProofSession(document);
      const candidate = action.kind === "apply-move"
        ? applyProofMove(session, action.moveId)
        : focusGoal(session, action.goalId);
      return this.certify(candidate, onProgress);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.sequence.then(operation);
    this.sequence = result.then(() => undefined, () => undefined);
    return result;
  }

  private async certify(candidate: ProofSession, onProgress?: ProgressListener): Promise<ProofSnapshot> {
    const normalized = decodeProofSession(candidate);
    onProgress?.({ phase: "checking" });
    const started = performance.now();
    const certificate = this.kernel.check(normalized);
    const elapsedMs = Math.round(performance.now() - started);
    const complete = normalized.goals.every((goal) => goal.status === "solved");
    const session = complete ? markKernelChecked(normalized) : normalized;
    return {
      session,
      moves: enumerateProofMoves(session),
      lessons: lessonCatalog,
      script: certificate.script,
      kernelVersion: "TouchProof DTT 0.1",
      evidence: {
        status: "validated",
        scope: complete ? "completed-theorem" : "transitions",
        sourceHash: await sha256(certificate.script),
        kernel: "TouchProof DTT 0.1",
        elapsedMs,
      },
    };
  }
}

let sharedBackend: BrowserProofBackend | undefined;

export function browserProofBackend(): BrowserProofBackend {
  sharedBackend ??= new BrowserProofBackend();
  return sharedBackend;
}
