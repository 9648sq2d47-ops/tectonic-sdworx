import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HandoverForm } from "./HandoverForm";
import ClaimBoardError from "./error";
import { initialHandoverState, type HandoverActionState } from "./handover-state";

const fixture = vi.hoisted(() => ({ state: null as unknown, action: vi.fn(), pending: false }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: () => [fixture.state, fixture.action, fixture.pending],
}));
vi.mock("./handover-actions", () => ({ captureHandoverAction: vi.fn() }));

function form(available = true) {
  return renderToStaticMarkup(createElement(HandoverForm, {
    workspaceId: "ws-demo", clientId: "cl-demo",
    availability: {
      available, provider: "google", providerLabel: "Google Gemini",
      reason: available ? null : "DISABLED",
      message: available ? "" : "Live capture is disabled for this synthetic demo.",
    },
  }));
}

describe("handover form feedback", () => {
  beforeEach(() => { fixture.state = initialHandoverState; fixture.pending = false; });

  it("shows an unavailable notice and disables all editable capture controls", () => {
    const html = form(false);
    expect(html).toContain("Live capture is disabled for this synthetic demo.");
    expect(html).toMatch(/<input(?=[^>]*name="saidAt")(?=[^>]*disabled="")[^>]*>/);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });

  it("renders the action's error beside retained date and transcript values", () => {
    fixture.state = {
      ...initialHandoverState, status: "error", message: "Extraction could not be completed. Your input is kept here.",
      values: { saidAt: "2026-11-09", transcript: "Nadia: Synthetic meal vouchers remain subject to the agreed exception." },
    } satisfies HandoverActionState;
    const html = form();
    expect(html).toContain('value="2026-11-09"');
    expect(html).toContain("Nadia: Synthetic meal vouchers remain subject to the agreed exception.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Your input is kept here.");
  });

  it("surfaces partial acceptance and candidate rejection reasons", () => {
    fixture.state = {
      ...initialHandoverState, status: "captured", message: "5 claims added; 1 rejected.",
      summary: { status: "captured", acceptedCount: 5, rejectedCount: 1, limitReached: true, rejections: [{ index: 2, reason: "Quote is not a full source turn." }] },
    } satisfies HandoverActionState;
    const html = form();
    expect(html).toContain("5 claims added; 1 rejected.");
    expect(html).toContain("Candidate 3: Quote is not a full source turn.");
    expect(html).toContain("five-claim limit was reached");
  });

  it("offers a safe retry boundary without exposing the exception", () => {
    const html = renderToStaticMarkup(createElement(ClaimBoardError, {
      error: new Error("synthetic-secret or provider stack"), retry: vi.fn(),
    }));
    expect(html).toContain("Retry");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("synthetic-secret");
    expect(html).not.toContain("provider stack");
  });
});
