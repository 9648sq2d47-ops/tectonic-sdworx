import "server-only";
import { createLlm, llmAvailable } from "@/lib/ai/llm";
import { assessClient, type Assessment } from "./assess";
import { createStubLlm } from "./testing";

const TTL_MS = 5 * 60 * 1000;
type AssessmentCache = Map<string, { at: number; value: Promise<Assessment> }>;

declare global {
  // Shared by route bundles in this server process only. Neither durable nor distributed.
  var __relayAssessmentCache: AssessmentCache | undefined;
}

const cache = () => (globalThis.__relayAssessmentCache ??= new Map());
const cacheKey = (workspaceId: string, clientId: string) => JSON.stringify([workspaceId, clientId]);

/** Assessment per workspace/client, cached per server process so page loads do not re-run LLM calls. */
export function assessClientCached(workspaceId: string, clientId: string): Promise<Assessment> {
  const key = cacheKey(workspaceId, clientId);
  const current = cache();
  const hit = current.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const llm = llmAvailable() ? createLlm() : createStubLlm();
  const value = assessClient(workspaceId, clientId, llm);
  current.set(key, { at: Date.now(), value });
  value.catch(() => {
    // A failed request invalidated earlier must not evict its successful replacement.
    if (current.get(key)?.value === value) current.delete(key);
  });
  return value;
}

export function invalidateAssessmentCache(workspaceId: string, clientId: string): void {
  cache().delete(cacheKey(workspaceId, clientId));
}

export function llmMode(): "live" | "offline" {
  return llmAvailable() ? "live" : "offline";
}
