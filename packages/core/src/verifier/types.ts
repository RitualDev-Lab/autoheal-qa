import type { PatchResult, PatcherOptions } from "../patcher/types.js";

export interface TestTarget {
  testFile: string;
  testTitle?: string;
  line?: number;
}

export interface VerificationOutcome {
  passed: boolean;
  exitCode: number;
  durationMs: number;
  output: string;
  error?: string;
}

export type VerificationRunner = (target: TestTarget) => Promise<VerificationOutcome>;

export interface VerificationCandidate {
  suggestedLocator: string;
  confidence: number;
  explanation?: string;
}

export interface VerificationLoopOptions {
  runner?: VerificationRunner;
  maxCandidateRetries?: number; // default: 3
  patcherOptions?: PatcherOptions;
}

export interface CandidateAttemptRecord {
  candidate: VerificationCandidate;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface VerificationLoopResult {
  status: "VERIFIED" | "FAILED_VERIFICATION" | "NO_CANDIDATES";
  verifiedCandidate?: VerificationCandidate;
  finalPatch?: PatchResult;
  attempts: CandidateAttemptRecord[];
  totalDurationMs: number;
}
