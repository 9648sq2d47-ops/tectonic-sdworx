"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessError, requireWorkspaceMember } from "@/lib/auth/access";
import { captureAvailability, generateCaptureText } from "@/lib/ai/llm";
import { rateLimit } from "@/lib/rate-limit";
import { invalidateAssessmentCache } from "@/relay/assess-cached";
import { HandoverInputError } from "@/relay/handover-contract";
import { captureHandoverOnce, getClient } from "@/relay/store";
import type { HandoverActionState } from "./handover-state";

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export async function captureHandoverAction(
  _previousState: HandoverActionState,
  data: FormData,
): Promise<HandoverActionState> {
  const workspaceId = field(data, "workspaceId");
  const clientId = field(data, "clientId");
  // Preserve what was entered. Core normalizes its processing copy before validation.
  const values = { transcript: field(data, "transcript"), saidAt: field(data, "saidAt") };
  const failure = (message: string, status: "error" | "unavailable" = "error"): HandoverActionState =>
    ({ status, message, values, summary: null });

  let member: Awaited<ReturnType<typeof requireWorkspaceMember>>;
  try {
    member = await requireWorkspaceMember(workspaceId);
  } catch (error) {
    // Do not catch the navigation exception or treat an expired login as extraction failure.
    if (error instanceof AccessError && error.status === 401) redirect("/login");
    return failure("This workspace or client is unavailable. Return to your workspace and try again.");
  }
  if (!getClient(workspaceId, clientId)) {
    return failure("This workspace or client is unavailable. Return to your workspace and try again.");
  }

  const availability = captureAvailability();
  if (!availability.available) return failure(availability.message, "unavailable");

  // Demo limit is process-local; it is not a distributed abuse-prevention boundary.
  const limit = rateLimit(`handover-extract:${workspaceId}:${member.user.id}`, 5, 60_000);
  if (!limit.ok) {
    const waitSeconds = Math.max(1, Math.ceil(limit.retryAfterMs / 1000));
    return failure(`Too many extraction attempts. Wait ${waitSeconds} seconds and try again. Your input is kept here.`);
  }

  let summary;
  try {
    summary = await captureHandoverOnce({ workspaceId, clientId, ...values }, generateCaptureText);
  } catch (error) {
    // Core validation errors have static messages. Never return a raw provider/SDK exception.
    return failure(error instanceof HandoverInputError
      ? error.message
      : "Extraction could not be completed. Your input is kept here; please try again later.");
  }

  if (summary.status === "captured" && summary.acceptedCount > 0) {
    invalidateAssessmentCache(workspaceId, clientId);
    revalidatePath(`/w/${workspaceId}/clients/${clientId}`);
  }
  const message = summary.status === "duplicate"
    ? "This handover was already captured. No duplicate claims were added."
    : summary.status === "rejected"
      ? "No claims were added. Review the rejected items and revise the synthetic handover."
      : `${summary.acceptedCount} claim${summary.acceptedCount === 1 ? "" : "s"} added; ${summary.rejectedCount} rejected. Review each claim before relying on it.`;
  return { status: summary.status, message, values, summary };
}
