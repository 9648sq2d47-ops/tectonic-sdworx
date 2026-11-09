import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Claim, Client } from "./types";
import { createStubLlm } from "./testing";
import { assessClient } from "./assess";
import { clearSignals } from "./registry";

const data = vi.hoisted(() => ({ claims: [] as Claim[], clients: [] as Client[] }));
vi.mock("./store", () => ({
  listClaims: () => data.claims,
  listClients: () => data.clients,
  listDocuments: () => [],
  listPeople: () => [],
}));

beforeEach(() => {
  clearSignals();
  data.clients = [{ id: "client", workspaceId: "workspace", name: "Synthetic client", jurisdiction: { country: "BE", jointCommittee: "118" } }];
  data.claims = [{
    id: "old-record", workspaceId: "workspace", clientId: "client", sourceDocumentId: "transcript",
    text: "Meal vouchers are six euro.", saidAt: "2026-01-01", topics: ["benefits"], anchors: [],
  }];
});

describe("assessment of older or seeded claims", () => {
  it("checks actual claim text even when stored model tags and anchors missed a legal topic", async () => {
    const result = await assessClient("workspace", "client", createStubLlm(), new Date("2026-11-09T00:00:00Z"));
    expect(result.trust.get("old-record")?.signals.some((signal) => signal.signalId === "regulation-watch")).toBe(true);
    expect(result.claims[0].anchors.map((anchor) => anchor.topic)).toContain("meal-vouchers");
    expect(data.claims[0].anchors).toEqual([]); // Assessment does not rewrite the stored record.
  });

  it("does not manufacture a legal topic from a misleading old tag or anchor", async () => {
    data.claims[0] = {
      ...data.claims[0], text: "Payroll slips are sent on Tuesday.", topics: ["indexation"],
      anchors: [{ topic: "indexation", jurisdiction: { country: "BE", jointCommittee: "118" } }],
    };
    const result = await assessClient("workspace", "client", createStubLlm());
    expect(result.claims[0].anchors).toEqual([]);
    expect(result.trust.get("old-record")?.signals.some((signal) => signal.signalId === "regulation-watch")).toBe(false);
  });

  it.each(["missing committee", "missing client"])("keeps %s as an explicit human-review gap without a model call", async (gap) => {
    if (gap === "missing committee") data.clients[0].jurisdiction = { country: "BE" };
    else data.clients = [];
    const generateJson = vi.fn();
    const embed = vi.fn();
    const result = await assessClient("workspace", "client", createStubLlm({ generateJson, embed }));
    expect(result.errors).toEqual([expect.objectContaining({ signalId: "legal-context" })]);
    expect(result.trust.get("old-record")?.verdict).toBe("unknown");
    expect(result.trust.get("old-record")?.reasons[0]).toContain("Human review is required");
    expect(generateJson).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });
});
