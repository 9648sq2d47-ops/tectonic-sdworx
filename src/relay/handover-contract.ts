/** Shared bounds and plain return values for the local handover demonstration. */
export const MIN_TRANSCRIPT_CHARS = 40;
export const MAX_TRANSCRIPT_CHARS = 8000;
export const MAX_TURN_CHARS = 1000;
export const MAX_CLAIMS = 5;

export type HandoverInputErrorCode = "INVALID_INPUT" | "INVALID_MODEL_OUTPUT" | "CLAIM_REJECTED";

/** Only static messages: never include provider or transcript data. */
export class HandoverInputError extends Error {
  constructor(message: string, readonly code: HandoverInputErrorCode = "INVALID_INPUT") {
    super(message);
    this.name = "HandoverInputError";
  }
}

export interface ClaimRejection {
  /** Zero-based row in the model's claims array, not a source-message index. */
  index: number;
  reason: string;
}

export interface CaptureSummary {
  status: "captured" | "duplicate" | "rejected";
  acceptedCount: number;
  rejectedCount: number;
  rejections: ClaimRejection[];
  /** The fixed extraction cap was reached; this is never a completeness claim. */
  limitReached: boolean;
}

/** The sole source-text normalisation: line endings and outer whitespace. */
export function normalizeTranscript(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function requireHandoverDate(value: string): string {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HandoverInputError("Invalid handover date");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HandoverInputError("Invalid handover date");
  }
  // Date-only input has no user timezone. Allow the next UTC calendar date for
  // clients ahead of UTC; this is a bounded tolerance, not proof of event time.
  const latest = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (date > latest) throw new HandoverInputError("Handover date is more than one UTC calendar day ahead");
  return date;
}
