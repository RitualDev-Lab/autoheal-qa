import type { CandidateElement } from "../snapshot/types.js";
import type { TargetAction } from "../types.js";

export type LocatorType =
  | "role"
  | "testid"
  | "placeholder"
  | "text"
  | "label"
  | "css"
  | "xpath"
  | "unknown";

export interface ParsedLocator {
  raw: string;
  type: LocatorType;
  role?: string;
  name?: string;
  value?: string;
  exact?: boolean;
  selector?: string;
}

export interface ScoreBreakdown {
  stringSimilarity: number;
  roleMatch: number;
  actionCompatibility: number;
  attributeMatch: number;
}

export interface HeuristicMatch {
  candidate: CandidateElement;
  suggestedLocator: string;
  confidence: number;
  matchReason: string;
  breakdown: ScoreBreakdown;
}

export interface HeuristicEngineOptions {
  minConfidence?: number;
  maxCandidates?: number;
}
