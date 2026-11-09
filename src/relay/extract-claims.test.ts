import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractClaimsFromTranscript, extractClaimsWithDiagnostics, legalAnchorsForClaim, LEGAL_TOPIC_TERMS, parseModelJson, parseTurns } from "./extract-claims";
import { captureHandoverOnce, listClaims, listDocuments, resetStore } from "./store";
import { MAX_CLAIMS, MAX_TURN_CHARS, normalizeTranscript } from "./handover-contract";
import { PEOPLE } from "./fixtures/demo-workspace";
import { REGULATION_FEED } from "./signals/regulation-watch/feed";

const context = { country: "BE", region: "Flanders", jointCommittee: "118" };
const quote = "The client prefers a phone call before noon.";
const input = { workspaceId: "ws-demo", clientId: "cl-janssens", transcript: `Nadia: ${quote}`, saidAt: "2026-09-29" };
const row = (text: string, speakerName: string | null = "Nadia") => ({ text, quote: text, topics: ["contact"], speakerName });

beforeEach(() => {
  resetStore();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled in synthetic extraction tests"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reviewed transcript boundaries", () => {
  it.each([
    "Except: only for staff hired before 2024.",
    "at 10:30 unless the client objects.",
    "Sunday premium: fifty percent.",
    "Sunday: the office remains closed.",
  ])("keeps the continuation inside the original turn: %s", async (continuation) => {
    const first = "Meal vouchers are seven euro per day worked.";
    const whole = `${first}\n${continuation}`;
    const transcript = `Nadia: ${whole}`;
    expect(parseTurns(transcript)).toHaveLength(1);
    expect(parseTurns(transcript)[0]).toMatchObject({ name: "Nadia", text: whole });
    const clipped = await extractClaimsWithDiagnostics(transcript, async () => JSON.stringify({ claims: [row(first)] }), PEOPLE);
    expect(clipped.claims).toHaveLength(0);
    expect(clipped.rejections[0].reason).toContain("complete source turn");
    const preserved = await extractClaimsFromTranscript(transcript, async () => JSON.stringify({ claims: [row(whole)] }), PEOPLE);
    expect(preserved[0].quote).toBe(whole);
  });

  it("keeps a supported personal name with particles", async () => {
    const transcript = `Jan van den Broeck: ${quote}`;
    const claims = await extractClaimsFromTranscript(transcript, async () => JSON.stringify({ claims: [row(quote, "Jan van den Broeck")] }), PEOPLE);
    expect(claims[0].speakerName).toBe("Jan van den Broeck");
  });

  it("accepts the complete occurrence without letting an embedded occurrence veto it", async () => {
    const transcript = `Nadia: ${quote}\nTom: I heard that ${quote} Is that right?`;
    const result = await captureHandoverOnce({ ...input, transcript }, async () => JSON.stringify({ claims: [row(quote)] }));
    expect(result).toMatchObject({ status: "captured", acceptedCount: 1, rejectedCount: 0 });
    expect(listClaims("ws-demo", "cl-janssens").find((claim) => claim.id.startsWith("claim-live-"))?.speakerId).toBe("p-nadia");
  });

  it("accepts full turns longer than the former 240-character bound", async () => {
    const text = "The customer asks us to retain the complete conditions. ".repeat(10).trim();
    expect(text.length).toBeGreaterThan(240);
    const result = await captureHandoverOnce({ ...input, transcript: `Nadia: ${text}` }, async () => JSON.stringify({ claims: [row(text)] }));
    expect(result.acceptedCount).toBe(1);
    expect(listClaims("ws-demo", "cl-janssens").find((claim) => claim.id.startsWith("claim-live-"))?.quote).toBe(text);
  });

  it.each(["unlabeled", "labeled"])("rejects an unusable %s transcript before generation", async (kind) => {
    const text = "x".repeat(MAX_TURN_CHARS + 1);
    const generate = vi.fn(async () => JSON.stringify({ claims: [row(text)] }));
    await expect(captureHandoverOnce({ ...input, transcript: kind === "labeled" ? `Nadia: ${text}` : text }, generate)).rejects.toThrow("No complete speaker turn fits");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("per-claim outcomes and bounded model parsing", () => {
  it("retains one valid claim and reports an invalid schema row without quoting it", async () => {
    const result = await captureHandoverOnce(input, async () => JSON.stringify({ claims: [row(quote), { secret: "sensitive rejected value" }] }));
    expect(result).toMatchObject({ status: "captured", acceptedCount: 1, rejectedCount: 1, rejections: [{ index: 1 }] });
    expect(JSON.stringify(result)).not.toContain("sensitive rejected value");
    expect(listDocuments("ws-demo", "cl-janssens").filter((doc) => doc.content === input.transcript)).toHaveLength(1);
  });

  it("rejects a legal-context mismatch per row without discarding a valid operational claim", async () => {
    const invalid = "Meal vouchers under Commission paritaire 124 are six euro.";
    const transcript = `${input.transcript}\nEls: ${invalid}`;
    const result = await captureHandoverOnce({ ...input, transcript }, async () => JSON.stringify({ claims: [row(quote), row(invalid, "Els")] }));
    expect(result).toMatchObject({ status: "captured", acceptedCount: 1, rejectedCount: 1 });
    expect(result.rejections[0].reason).toContain("joint committee");
    expect(listClaims("ws-demo", "cl-janssens").some((claim) => claim.text === invalid)).toBe(false);
  });

  it("stores neither transcript nor claims when every row is rejected, and permits a corrected retry", async () => {
    const documents = listDocuments("ws-demo").length;
    const claims = listClaims("ws-demo", "cl-janssens").length;
    const generate = vi.fn(async () => JSON.stringify({ claims: [{}, row("An invented quote which is absent from the source.")] }));
    const result = await captureHandoverOnce(input, generate);
    expect(result).toMatchObject({ status: "rejected", acceptedCount: 0, rejectedCount: 2 });
    expect(listDocuments("ws-demo")).toHaveLength(documents);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(claims);
    generate.mockResolvedValue(JSON.stringify({ claims: [row(quote)] }));
    expect((await captureHandoverOnce(input, generate)).status).toBe("captured");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("reports duplicate output and does not silently store it twice", async () => {
    const result = await captureHandoverOnce(input, async () => JSON.stringify({ claims: [row(quote), row(quote)] }));
    expect(result).toMatchObject({ acceptedCount: 1, rejectedCount: 1 });
    expect(result.rejections[0].reason).toContain("Duplicate");
  });

  it("retains the fixed five-claim cap and reports its reach and rejected overflow", async () => {
    const quotes = Array.from({ length: MAX_CLAIMS + 1 }, (_, index) => `The client asks to discuss operational item ${index + 1} tomorrow.`);
    const transcript = quotes.map((text) => `Nadia: ${text}`).join("\n");
    const result = await captureHandoverOnce({ ...input, transcript }, async () => JSON.stringify({ claims: quotes.map((text) => row(text)) }));
    expect(result).toMatchObject({ status: "captured", acceptedCount: MAX_CLAIMS, rejectedCount: 1, limitReached: true });
    expect(result.rejections[0]).toMatchObject({ index: 5 });
    expect(listClaims("ws-demo", "cl-janssens").filter((claim) => claim.id.startsWith("claim-live-"))).toHaveLength(MAX_CLAIMS);
  });

  it.each([
    (json: string) => `\`\`\`json\n${json}\n\`\`\``,
    (json: string) => `${json}\nHere is the requested extraction.`,
  ])("accepts a JSON object surrounded by outer formatting", async (wrap) => {
    const result = await captureHandoverOnce(input, async () => wrap(JSON.stringify({ claims: [row(quote, null)] })));
    expect(result.acceptedCount).toBe(1);
  });

  it("does not confuse braces or escaped quotes inside JSON strings with the object end", () => {
    const value = { claims: [{ text: 'a quoted "}" with a slash \\ and { text' }] };
    expect(parseModelJson(`${JSON.stringify(value)} extra text`)).toEqual(value);
  });

  it("returns a static parsing error without the raw provider response", async () => {
    await expect(captureHandoverOnce(input, async () => '{"secret":"never disclose",')).rejects.toThrow("Model returned incomplete JSON");
  });
});

describe("text-derived legal topics", () => {
  it("has a recogniser for every current feed topic", () => {
    for (const topic of new Set(REGULATION_FEED.map((notice) => notice.topic))) expect(LEGAL_TOPIC_TERMS[topic]).toBeDefined();
  });

  it("does not rely on a model-selected benefit tag to trigger the meal-voucher check", () => {
    expect(legalAnchorsForClaim({ text: "Meal vouchers are six euro.", topics: ["benefits"] }, context).map((anchor) => anchor.topic)).toEqual(["meal-vouchers"]);
    expect(legalAnchorsForClaim({ text: "Send the payslips by email.", topics: ["indexation"] }, context)).toEqual([]);
  });

  it.each(["Commission paritaire 124", "CP n° 124", "PSC 124.03", "cp n° 124", "psc 124.03", "scp 124.03", "pc 20"])("detects an explicit conflicting committee: %s", (committee) => {
    expect(() => legalAnchorsForClaim({ text: `Meal vouchers under ${committee} are six euro.`, topics: ["benefits"] }, context)).toThrow("joint committee");
  });

  it.each(["same rule as PC 200", "same rule as cp 200", "PC 118.03", "psc 118.03"])("does not treat this as a conflicting committee assertion: %s", (phrase) => {
    expect(legalAnchorsForClaim({ text: `Meal vouchers: ${phrase}.`, topics: [] }, context)).toHaveLength(1);
  });
});

describe("source normalisation and date preflight", () => {
  it("normalises CRLF once and deduplicates an LF retry without another generator call", async () => {
    const text = `${quote}\r\nExcept: only on working days.`;
    const transcript = `Nadia: ${text}`;
    const generate = vi.fn(async () => JSON.stringify({ claims: [row(text)] }));
    expect((await captureHandoverOnce({ ...input, transcript }, generate)).status).toBe("captured");
    expect((await captureHandoverOnce({ ...input, transcript: normalizeTranscript(transcript) }, generate)).status).toBe("duplicate");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(listClaims("ws-demo", "cl-janssens").find((claim) => claim.id.startsWith("claim-live-"))?.quote).toBe(normalizeTranscript(text));
  });

  it("rejects distant future dates before model invocation with one UTC day of tolerance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
    const generate = vi.fn(async () => JSON.stringify({ claims: [row(quote)] }));
    expect(() => captureHandoverOnce({ ...input, saidAt: "2026-11-11" }, generate)).toThrow("one UTC calendar day ahead");
    expect(generate).not.toHaveBeenCalled();
    expect((await captureHandoverOnce({ ...input, saidAt: "2026-11-10" }, generate)).status).toBe("captured");
  });
});
