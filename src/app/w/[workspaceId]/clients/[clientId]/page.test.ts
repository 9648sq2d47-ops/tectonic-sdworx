import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClaimBoardPage from "./page";
import { HandoverForm } from "./HandoverForm";

const fixture = vi.hoisted(() => ({
  availability: { available: false, provider: "google", providerLabel: "Google Gemini", reason: "DISABLED", message: "Live capture is disabled for this synthetic demo." },
  claim: { id: "fixture-claim", text: "Fictional handover claim", workspaceId: "ws-demo", clientId: "cl-janssens" },
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: vi.fn() }));
vi.mock("@/lib/auth/access", () => ({
  requireWorkspacePage: async () => ({ user: { id: "u-incoming" }, workspace: { id: "ws-demo" } }),
}));
vi.mock("@/lib/ai/llm", () => ({ captureAvailability: () => fixture.availability }));
vi.mock("./HandoverForm", () => ({ HandoverForm: () => null }));
vi.mock("@/relay/assess-cached", () => ({
  assessClientCached: async () => ({ claims: [fixture.claim], trust: new Map([[fixture.claim.id, { verdict: "unsupported" }]]), errors: [] }),
  invalidateAssessmentCache: vi.fn(),
  llmMode: () => "offline",
}));
vi.mock("@/relay/store", () => ({
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
describe("synthetic handover page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture.availability.available = false;
  });

  it("passes the server gate to the form and retains the board and brief link", async () => {
    const nodes = await pageElements();
    expect(nodes.find(n => n.type === HandoverForm)?.props.availability).toEqual(fixture.availability);
    expect(nodes.find(n => n.props.id === "handover-demo-notice")?.props.children).toMatch(/single-instance.*server memory.*restart/);
    expect(nodes.some(n => n.props.claim === fixture.claim)).toBe(true);
    expect(nodes.some(n => n.props.href === "/w/ws-demo/clients/cl-janssens/brief")).toBe(true);
  });

  it("uses the selected provider in the explanation without hiding the board", async () => {
    fixture.availability.available = true; // Availability only; no live credential or call.
    const nodes = await pageElements();
    expect(nodes.find(n => n.type === HandoverForm)?.props.availability).toEqual(fixture.availability);
    expect(nodes.some(n => n.type === "p" && Children.toArray(n.props.children as ReactNode).includes("Google Gemini"))).toBe(true);
    expect(nodes.some(n => n.props.claim === fixture.claim)).toBe(true);
  });
});
