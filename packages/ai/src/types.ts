export type AIStrategy = "heuristic" | "ollama";

export interface AIOptions {
  endpoint?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
}

export interface AIHealingResult {
  healedLocator: string;
  confidence: number;
  strategy: AIStrategy;
  explanation: string;
  modelUsed?: string;
  durationMs: number;
}

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
}

export interface OrchestratorOptions {
  heuristicFastThreshold?: number; // e.g. 0.85
  aiOptions?: AIOptions;
  forceStrategy?: AIStrategy;
}

export interface ParsedAIHealingPayload {
  suggestedLocator: string;
  confidence: number;
  explanation: string;
}
