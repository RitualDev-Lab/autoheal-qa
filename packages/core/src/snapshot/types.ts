import type { FailureContext } from "../types.js";

export interface NormalizedAXNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  checked?: boolean | "mixed";
  pressed?: boolean | "mixed";
  level?: number;
  expanded?: boolean;
  focused?: boolean;
  children?: NormalizedAXNode[];
}

export interface CandidateElement {
  id: string;
  tag: string;
  role?: string;
  name?: string;
  text?: string;
  testId?: string;
  placeholder?: string;
  inputType?: string;
  href?: string;
  attributes: Record<string, string>;
  locators: string[];
}

export interface HarvestedSnapshot {
  url: string;
  title: string;
  timestamp: string;
  axTree?: NormalizedAXNode | null;
  prunedDom: string;
  interactiveElements: CandidateElement[];
}

export interface HarvestedFailureContext extends FailureContext {
  snapshot?: HarvestedSnapshot;
}
