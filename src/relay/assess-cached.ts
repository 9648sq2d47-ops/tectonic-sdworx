import "server-only";
import { createLlm, llmAvailable } from "@/lib/ai/llm";
import { assessClient, type Assessment } from "./assess";
import { createStubLlm } from "./testing";

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<Assessment> }>();

/** Assessment per workspace/client, cached per server process so page loads do not re-run LLM calls. */
export function assessClientCached(workspaceId: string, clientId: string): Promise<Assessment> {
  const key = `${workspaceId}/${clientId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const llm = llmAvailable() ? createLlm() : createStubLlm();
  const value = assessClient(workspaceId, clientId, llm);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

export function invalidateAssessmentCache(workspaceId: string, clientId: string): void {
  cache.delete(`${workspaceId}/${clientId}`);
}

export function llmMode(): "live" | "offline" {
  return llmAvailable() ? "live" : "offline";
}
