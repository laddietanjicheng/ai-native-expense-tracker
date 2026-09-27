import type { Proposal } from "@/features/insights/types";

export type { Proposal };

export type ChatRole = "user" | "assistant";

export interface TextSegment {
  kind: "text";
  text: string;
}

export interface ProposalSegment {
  kind: "proposal";
  proposal: Proposal;
  key: string;
}

export type MessageSegment = TextSegment | ProposalSegment;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Plain text only (no proposals) — what gets sent back to the API as history. */
  content: string;
  /** Ordered render segments; only assistant messages mix text and proposals. */
  segments: MessageSegment[];
  errorText?: string | null;
}

export type ChatMode = "docked" | "expanded" | "minimised";

export const MAX_HISTORY_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2_000;

export const EXAMPLE_QUESTIONS = [
  "Why did I spend more this month?",
  "I only want to spend S$1,000 next month. How should I split it?",
  "Where can I save S$100 next month?",
  "What are my repeat charges?",
];
