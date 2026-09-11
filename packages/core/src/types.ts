export type FailureType =
  | "TIMEOUT"
  | "STRICT_MODE_VIOLATION"
  | "NOT_VISIBLE"
  | "NOT_ATTACHED"
  | "UNKNOWN";

export type TargetAction =
  | "click"
  | "fill"
  | "check"
  | "uncheck"
  | "hover"
  | "dblclick"
  | "press"
  | "selectOption"
  | "waitFor"
  | "unknown";

export interface ParsedLocation {
  file: string;
  line: number;
  column: number;
}

export interface ParsedErrorDetails {
  action: TargetAction;
  actionArg?: string;
  brokenLocator: string;
  failureType: FailureType;
  rawErrorMessage: string;
  location?: ParsedLocation;
}

export interface FailureContext extends ParsedErrorDetails {
  id: string;
  testTitle: string;
  durationMs: number;
  timestamp: string;
  snippet?: string;
}

export interface AutoHealConfig {
  enabled: boolean;
  provider: "ollama" | "openai" | "heuristic-only";
  model?: string;
  autoApply: boolean;
  interactive: boolean;
}
