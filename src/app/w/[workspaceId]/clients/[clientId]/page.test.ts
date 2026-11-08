import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClaimBoardPage from "./page";

const fixture = vi.hoisted(() => ({
  configured: false,
  member: vi.fn(),
  refresh: vi.fn(),
  capture: vi.fn(),
  generate: vi.fn(),
  claim: { id: "fixture-claim", text: "Fictional handover claim", workspaceId: "ws-demo", clientId: "cl-janssens" },
}));

vi.mock("next/cache", () => ({ refresh: fixture.refresh, revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireWorkspaceMember: fixture.member,
  requireWorkspacePage: async () => ({ user: { id: "u-incoming" }, workspace: { id: "ws-demo" } }),
}));
vi.mock("@/lib/env", () => ({
  env: () => ({ OPENAI_API_KEY: fixture.configured ? "fictional-configuration-indicator" : undefined }),
}));
vi.mock("@/lib/ai/openai", () => ({ generateText: fixture.generate }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true }) }));
vi.mock("@/relay/assess-cached", () => ({
  assessClientCached: async () => ({ claims: [fixture.claim], trust: new Map([[fixture.claim.id, { verdict: "unsupported" }]]), errors: [] }),
  invalidateAssessmentCache: vi.fn(),
  llmMode: () => "offline",
}));
vi.mock("@/relay/store", () => ({
  captureHandoverOnce: fixture.capture,
  getClient: () => ({ id: "cl-janssens", name: "Fictional client" }),
  getReview: () => undefined,
  listDocuments: () => [],
  listPeople: () => [],
}));

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode }>(child)
    ? [child as Element, ...elements(child.props.children)] : []);
}
async function pageElements() {
  return elements(await ClaimBoardPage({
    params: Promise.resolve({ workspaceId: "ws-demo", clientId: "cl-janssens" }),
    searchParams: Promise.resolve({}),
  }));
}
function submission() {
  const data = new FormData();
  data.set("workspaceId", "ws-demo");
  data.set("clientId", "cl-janssens");
  data.set("saidAt", "2026-11-09");
  data.set("transcript", "Nadia: This is a fictional handover for the missing-provider regression only.");
  return data;
}

describe("handover without OpenAI configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.configured = false;
    fixture.member.mockReset().mockResolvedValue({ user: { id: "u-incoming" } });
  });

  it("explains unavailability, disables extraction, and retains the board and brief link", async () => {
    const nodes = await pageElements();
    const notice = nodes.find(n => n.props.role === "status");
    expect(notice?.props.children).toMatch(/OpenAI is not configured/);
    expect(nodes.find(n => n.type === "button" && n.props.type === "submit")?.props.disabled).toBe(true);
    expect(nodes.find(n => n.props.name === "saidAt")?.props.disabled).toBe(true);
    expect(nodes.find(n => n.props.name === "transcript")?.props.disabled).toBe(true);
    expect(nodes.some(n => n.props.claim === fixture.claim)).toBe(true);
    expect(nodes.some(n => n.props.href === "/w/ws-demo/clients/cl-janssens/brief")).toBe(true);
  });

  it("safely handles a stale form without invoking extraction or the provider", async () => {
    const action = (await pageElements()).find(n => n.type === "form")!.props.action as (data: FormData) => Promise<void>;
    await expect(action(submission())).resolves.toBeUndefined();
    expect(fixture.member).toHaveBeenCalledWith("ws-demo");
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
    expect(fixture.refresh).toHaveBeenCalledOnce();
  });

  it("still requires workspace authentication before handling missing configuration", async () => {
    const action = (await pageElements()).find(n => n.type === "form")!.props.action as (data: FormData) => Promise<void>;
    fixture.member.mockRejectedValueOnce(new Error("Authentication required"));
    await expect(action(submission())).rejects.toThrow("Authentication required");
    expect(fixture.refresh).not.toHaveBeenCalled();
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
  });

  it("keeps the configured form available without making a provider call", async () => {
    fixture.configured = true; // Mocked availability only, never a real provider credential.
    const nodes = await pageElements();
    expect(nodes.find(n => n.props.role === "status")).toBeUndefined();
    expect(nodes.find(n => n.type === "button" && n.props.type === "submit")?.props.disabled).toBeFalsy();
    expect(fixture.capture).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
  });
});
