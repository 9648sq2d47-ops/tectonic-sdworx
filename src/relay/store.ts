/**
 * In-memory store seeded from the demo fixtures. Every read is workspace-scoped:
 * callers never fetch a record by id alone.
 */
import { createHash, randomUUID } from "node:crypto";
import type {
  Claim,
  ClaimReview,
  Client,
  KnowledgeDocument,
  Person,
  ReviewStatus,
  User,
  Workspace,
} from "./types";
import * as demo from "./fixtures/demo-workspace";
import { extractClaimsFromTranscript, legalAnchorsForClaim, resolveQuotedSpeaker, type TextGenerator } from "./extract-claims";

interface Store {
  workspaces: Workspace[];
  users: User[];
  people: Person[];
  clients: Client[];
  documents: KnowledgeDocument[];
  claims: Claim[];
  reviews: Map<string, ClaimReview>; // key: `${workspaceId}/${claimId}`
  handoversInFlight?: Map<string, Promise<void>>;
}

declare global {
  // Survives Next dev hot reloads; there is one store per server process.
  var __relayStore: Store | undefined;
}

function seed(): Store {
  return {
    workspaces: [demo.WORKSPACE, { id: "ws-other", name: "Another team" }],
    users: [...demo.USERS],
    people: [...demo.PEOPLE],
    clients: [...demo.CLIENTS],
    documents: [...demo.DOCUMENTS],
    claims: [...demo.CLAIMS],
    reviews: new Map(demo.REVIEWS.map((r) => [`${r.workspaceId}/${r.claimId}`, r])),
  };
}

function store(): Store {
  globalThis.__relayStore ??= seed();
  return globalThis.__relayStore;
}

/** Test helper. */
export function resetStore(): void {
  globalThis.__relayStore = seed();
}

export function findUserByEmail(email: string): User | undefined {
  const needle = email.trim().toLowerCase();
  return store().users.find((u) => u.email.toLowerCase() === needle);
}

export function findUserById(id: string): User | undefined {
  return store().users.find((u) => u.id === id);
}

export function isMember(user: User, workspaceId: string): boolean {
  return user.workspaceIds.includes(workspaceId);
}

export function getWorkspace(workspaceId: string): Workspace | undefined {
  return store().workspaces.find((w) => w.id === workspaceId);
}

export function listWorkspacesFor(user: User): Workspace[] {
  return store().workspaces.filter((w) => user.workspaceIds.includes(w.id));
}

export function listClients(workspaceId: string): Client[] {
  return store().clients.filter((c) => c.workspaceId === workspaceId);
}

export function getClient(workspaceId: string, clientId: string): Client | undefined {
  return store().clients.find((c) => c.workspaceId === workspaceId && c.id === clientId);
}

export function listDocuments(workspaceId: string, clientId?: string): KnowledgeDocument[] {
  return store().documents.filter(
    (d) => d.workspaceId === workspaceId && (clientId === undefined || d.clientId === clientId),
  );
}

export function getDocument(workspaceId: string, documentId: string): KnowledgeDocument | undefined {
  return store().documents.find((d) => d.workspaceId === workspaceId && d.id === documentId);
}

export function listPeople(workspaceId: string): Person[] {
  return store().people.filter((p) => p.workspaceId === workspaceId);
}

export function listClaims(workspaceId: string, clientId: string): Claim[] {
  return store().claims.filter((c) => c.workspaceId === workspaceId && c.clientId === clientId);
}

export function getClaim(workspaceId: string, claimId: string): Claim | undefined {
  return store().claims.find((c) => c.workspaceId === workspaceId && c.id === claimId);
}

/** Coalesce exact retries before generation, within this server process only. */
export function captureHandoverOnce(
  input: { workspaceId: string; clientId: string; transcript: string },
  generateText: TextGenerator,
): Promise<void> {
  const { workspaceId, clientId } = input;
  const transcript = input.transcript.trim();
  const client = getClient(workspaceId, clientId);
  if (!client) throw new Error("Client not found");
  if (transcript.length < 40 || transcript.length > 8000) throw new Error("Invalid transcript length");
  const s = store();
  if (s.documents.some((d) => d.kind === "transcript" && d.workspaceId === workspaceId &&
    d.clientId === clientId && d.content.trim() === transcript)) return Promise.resolve();

  const key = createHash("sha256").update(JSON.stringify([workspaceId, clientId, transcript])).digest("hex");
  const pending = s.handoversInFlight ??= new Map();
  const existing = pending.get(key);
  if (existing) return existing;
  // Queue the work so the reservation is set synchronously before any model call.
  const operation = Promise.resolve().then(async () => {
    const people = listPeople(workspaceId);
    const drafts = await extractClaimsFromTranscript(transcript, generateText, people);
    const saidAt = new Date().toISOString().slice(0, 10);
    const documentId = `doc-live-${randomUUID()}`;
    const claims: Claim[] = drafts.map((draft) => ({
      id: `claim-live-${randomUUID()}`, workspaceId, clientId,
      text: draft.text, quote: draft.quote,
      speakerId: resolveQuotedSpeaker(transcript, draft.quote, people, draft.speakerName).id,
      saidAt, sourceDocumentId: documentId, topics: draft.topics,
      anchors: legalAnchorsForClaim(draft, client.jurisdiction),
    }));
    addHandover({
      document: {
        id: documentId, workspaceId, clientId, kind: "transcript",
        title: `Live handover ${saidAt}`, content: transcript, updatedAt: saidAt,
        topics: [...new Set(drafts.flatMap((draft) => draft.topics))],
      },
      claims,
    });
  }).finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

export function addHandover(input: { document: KnowledgeDocument; claims: Claim[] }): void {
  const { document, claims } = input;
  const s = store();
  if (!document.clientId) throw new Error("Handover transcript must belong to a client");
  const client = s.clients.find((x) => x.workspaceId === document.workspaceId && x.id === document.clientId);
  if (!client) throw new Error("Client not found");
  if (claims.length === 0 || claims.length > 5) throw new Error("Handover must contain 1 to 5 claims");
  if (s.documents.some((d) => d.id === document.id) || claims.some((claim) => s.claims.some((x) => x.id === claim.id))) {
    throw new Error("Handover id already exists");
  }
  if (s.documents.some((d) => d.kind === "transcript" && d.workspaceId === document.workspaceId &&
    d.clientId === document.clientId && d.content.trim() === document.content.trim())) {
    throw new Error("Handover transcript already exists");
  }
  const people = listPeople(document.workspaceId);
  const validatedClaims: Claim[] = [];
  for (const claim of claims) {
    if (claim.workspaceId !== document.workspaceId || claim.clientId !== document.clientId) {
      throw new Error("Claim scope does not match transcript");
    }
    if (claim.sourceDocumentId !== document.id) throw new Error("Claim source does not match transcript");
    if (!claim.quote || !document.content.includes(claim.quote)) {
      throw new Error("Claim quote is not verbatim in transcript");
    }
    if (claim.text !== claim.quote || claim.text.length < 5 || claim.text.length > 240 || claim.text.trim() !== claim.text) {
      throw new Error("Claim text must equal its verbatim source quote (5 to 240 characters)");
    }
    const speakerId = resolveQuotedSpeaker(document.content, claim.quote, people).id;
    if (claim.speakerId !== undefined && claim.speakerId !== speakerId) {
      throw new Error("Claim speaker conflicts with the quoted transcript turn");
    }
    const expected = legalAnchorsForClaim(claim, client.jurisdiction);
    if (!Array.isArray(claim.anchors) || claim.anchors.length !== expected.length || expected.some((anchor) =>
      !claim.anchors.some((actual) => actual.topic === anchor.topic && actual.reference === undefined &&
        actual.jurisdiction?.country === anchor.jurisdiction.country &&
        actual.jurisdiction?.region === anchor.jurisdiction.region &&
        actual.jurisdiction?.jointCommittee === anchor.jurisdiction.jointCommittee))) {
      throw new Error("Legal anchors do not match the validated client context");
    }
    validatedClaims.push({ ...claim, speakerId });
  }
  s.documents.push(document);
  s.claims.push(...validatedClaims);
}

export function getReview(workspaceId: string, claimId: string): ClaimReview | undefined {
  return store().reviews.get(`${workspaceId}/${claimId}`);
}

export function listReviews(workspaceId: string): ClaimReview[] {
  return [...store().reviews.values()].filter((r) => r.workspaceId === workspaceId);
}

export function setReview(input: {
  workspaceId: string;
  claimId: string;
  status: ReviewStatus;
  note?: string;
  personId?: string;
  updatedBy: string;
}): ClaimReview {
  const review: ClaimReview = { ...input, updatedAt: new Date().toISOString() };
  store().reviews.set(`${input.workspaceId}/${input.claimId}`, review);
  return review;
}
