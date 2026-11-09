import type { CaptureSummary } from "@/relay/handover-contract";

export type HandoverActionState = {
  status: "idle" | "error" | "unavailable" | "captured" | "duplicate" | "rejected";
  message: string;
  values: { transcript: string; saidAt: string };
  summary: CaptureSummary | null;
};

export const initialHandoverState: HandoverActionState = {
  status: "idle",
  message: "",
  values: { transcript: "", saidAt: "" },
  summary: null,
};
