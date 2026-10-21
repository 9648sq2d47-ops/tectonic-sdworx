/**
 * In-memory store seeded from the demo fixtures. Every read is workspace-scoped:
 * callers never fetch a record by id alone.
 */
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

interface Store {
  workspaces: Workspace[];
  users: User[];
  people: Person[];
  clients: Client[];
  documents: KnowledgeDocument[];
  claims: Claim[];
  reviews: Map<string, ClaimReview>; // key: `${workspaceId}/${claimId}`
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

export function addHandover(input: { document: KnowledgeDocument; claims: Claim[] }): void {
  const { document, claims } = input;
  const s = store();
  if (!document.clientId) throw new Error("Handover transcript must belong to a client");
  if (!s.clients.some((x) => x.workspaceId === document.workspaceId && x.id === document.clientId)) {
    throw new Error("Client not found");
  }
  if (claims.length === 0 || claims.length > 5) throw new Error("Handover must contain 1 to 5 claims");
  if (s.documents.some((d) => d.id === document.id) || claims.some((claim) => s.claims.some((x) => x.id === claim.id))) {
    throw new Error("Handover id already exists");
  }
  for (const claim of claims) {
    if (claim.workspaceId !== document.workspaceId || claim.clientId !== document.clientId) {
      throw new Error("Claim scope does not match transcript");
    }
    if (claim.sourceDocumentId !== document.id) throw new Error("Claim source does not match transcript");
    if (!claim.quote || !document.content.includes(claim.quote)) {
      throw new Error("Claim quote is not verbatim in transcript");
    }
  }
  s.documents.push(document);
  s.claims.push(...claims);
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
