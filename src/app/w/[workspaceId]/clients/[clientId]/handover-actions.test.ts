import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/lib/auth/access";
import { HandoverInputError } from "@/relay/handover-contract";
import { captureHandoverAction } from "./handover-actions";
import { initialHandoverState } from "./handover-state";

const fixture = vi.hoisted(() => ({
  member: vi.fn(), client: vi.fn(), capture: vi.fn(), generate: vi.fn(), limit: vi.fn(),
  invalidate: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(),
  availability: { available: true, provider: "google", providerLabel: "Google Gemini", reason: null, message: "" },
}));
vi.mock("next/cache", () => ({ revalidatePath: fixture.revalidate }));
vi.mock("next/navigation", () => ({ redirect: fixture.redirect }));
vi.mock("@/lib/auth/access", () => ({
  AccessError: class extends Error { constructor(public readonly status: 401 | 404) { super("Access denied"); } },
  requireWorkspaceMember: fixture.member,
}));
vi.mock("@/lib/ai/llm", () => ({ captureAvailability: () => fixture.availability, generateCaptureText: fixture.generate }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: fixture.limit }));
vi.mock("@/relay/assess-cached", () => ({ invalidateAssessmentCache: fixture.invalidate }));
vi.mock("@/relay/store", () => ({ captureHandoverOnce: fixture.capture, getClient: fixture.client }));

const transcript = "Nadia: This synthetic handover confirms meal vouchers of seven euro.\r\nExcept: agency staff require a separate agreement.";
function submission() {
  const data = new FormData();
  data.set("workspaceId", "ws-demo"); data.set("clientId", "cl-demo");
  data.set("transcript", transcript); data.set("saidAt", "2026-11-09");
  return data;
}
const captured = { status: "captured", acceptedCount: 1, rejectedCount: 0, rejections: [], limitReached: false };

describe("bounded capture Server Action (all providers mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.member.mockReset().mockResolvedValue({ user: { id: "synthetic-user" } });
    fixture.client.mockReset().mockReturnValue({ id: "cl-demo" });
    fixture.capture.mockReset().mockResolvedValue(captured);
    fixture.limit.mockReset().mockReturnValue({ ok: true, retryAfterMs: 0 });
    fixture.redirect.mockReset().mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
    Object.assign(fixture.availability, { available: true, reason: null, message: "" });
  });

  it("reauthenticates and redirects an expired session before extraction", async () => {
    fixture.member.mockRejectedValueOnce(new AccessError(401));
    await expect(captureHandoverAction(initialHandoverState, submission())).rejects.toThrow("NEXT_REDIRECT");
    expect(fixture.redirect).toHaveBeenCalledExactlyOnceWith("/login");
    expect(fixture.client).not.toHaveBeenCalled();
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
  });

  it("rejects forged workspace membership without disclosing another client's existence", async () => {
    fixture.member.mockRejectedValueOnce(new AccessError(404));
    const data = submission(); data.set("workspaceId", "ws-other");
    const result = await captureHandoverAction(initialHandoverState, data);
    expect(fixture.member).toHaveBeenCalledExactlyOnceWith("ws-other");
    expect(result).toMatchObject({ status: "error", values: { transcript, saidAt: "2026-11-09" } });
    expect(result.message).toMatch(/workspace or client is unavailable/);
    expect(fixture.client).not.toHaveBeenCalled();
    expect(fixture.capture).not.toHaveBeenCalled();
  });

  it("looks up the client inside the authenticated workspace", async () => {
    fixture.client.mockReturnValueOnce(undefined);
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(fixture.client).toHaveBeenCalledExactlyOnceWith("ws-demo", "cl-demo");
    expect(result.status).toBe("error");
    expect(fixture.capture).not.toHaveBeenCalled();
  });

  it.each(["DISABLED", "PROVIDER_UNAVAILABLE"])("blocks a forged or stale form when %s", async reason => {
    Object.assign(fixture.availability, { available: false, reason, message: "Capture unavailable in this synthetic configuration." });
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(result).toMatchObject({ status: "unavailable", values: { transcript, saidAt: "2026-11-09" } });
    expect(fixture.member).toHaveBeenCalledWith("ws-demo");
    expect(fixture.limit).not.toHaveBeenCalled();
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
  });

  it("rate-limits by user and workspace while keeping both form values", async () => {
    fixture.limit.mockReturnValueOnce({ ok: false, retryAfterMs: 12001 });
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(fixture.limit).toHaveBeenCalledExactlyOnceWith("handover-extract:ws-demo:synthetic-user", 5, 60_000);
    expect(result.message).toMatch(/13 seconds/);
    expect(result.values).toEqual({ transcript, saidAt: "2026-11-09" });
    expect(fixture.capture).not.toHaveBeenCalled();
  });

  it("reports safe validation guidance and preserves the raw entry without cache mutation", async () => {
    fixture.capture.mockRejectedValueOnce(new HandoverInputError("Use a valid handover date.", "INVALID_INPUT"));
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(result.message).toBe("Use a valid handover date.");
    expect(result.values.transcript).toBe(transcript);
    expect(fixture.invalidate).not.toHaveBeenCalled();
    expect(fixture.revalidate).not.toHaveBeenCalled();
  });

  it("does not expose provider exception text, payloads or secrets", async () => {
    fixture.capture.mockRejectedValueOnce(new Error("401 bearer synthetic-secret, request: sensitive synthetic payload"));
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toMatch(/synthetic-secret|sensitive synthetic payload|401 bearer/);
    expect(result.values).toEqual({ transcript, saidAt: "2026-11-09" });
    expect(fixture.invalidate).not.toHaveBeenCalled();
  });

  it("retains valid claims, reports rejections and the cap, and invalidates only the changed client", async () => {
    const partial = { ...captured, acceptedCount: 5, rejectedCount: 2, rejections: [{ index: 1, reason: "Quote is not a full source turn." }], limitReached: true };
    fixture.capture.mockResolvedValueOnce(partial);
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(fixture.capture).toHaveBeenCalledExactlyOnceWith({ workspaceId: "ws-demo", clientId: "cl-demo", transcript, saidAt: "2026-11-09" }, fixture.generate);
    expect(result.summary).toEqual(partial);
    expect(result.message).toMatch(/5 claims added; 2 rejected/);
    expect(fixture.invalidate).toHaveBeenCalledExactlyOnceWith("ws-demo", "cl-demo");
    expect(fixture.revalidate).toHaveBeenCalledExactlyOnceWith("/w/ws-demo/clients/cl-demo");
  });

  it.each(["duplicate", "rejected"])("reports %s without invalidating unrelated cache entries", async status => {
    fixture.capture.mockResolvedValueOnce({ ...captured, status, acceptedCount: 0 });
    const result = await captureHandoverAction(initialHandoverState, submission());
    expect(result.status).toBe(status);
    expect(fixture.invalidate).not.toHaveBeenCalled();
    expect(fixture.revalidate).not.toHaveBeenCalled();
  });
});
