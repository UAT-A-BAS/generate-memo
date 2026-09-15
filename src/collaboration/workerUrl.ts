/**
 * Set NEXT_PUBLIC_COLLAB_DISABLED=true to build an artifact that never opens a
 * collaboration socket, so it can run with no Cloudflare Worker available.
 * The flag is compared against a literal so the bundler can drop the worker
 * URL entirely from disabled builds.
 */
export const COLLABORATION_DISABLED = process.env.NEXT_PUBLIC_COLLAB_DISABLED === "true";

export const DEFAULT_COLLAB_WORKER_URL = COLLABORATION_DISABLED
  ? ""
  : "https://generate-memo-collab.alex-marcello08.workers.dev";

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("127.");
}

export function resolveCollaborationWorkerBaseUrl(
  configuredUrl: string | undefined,
  pageHostname: string,
) {
  const candidate = configuredUrl?.trim() || DEFAULT_COLLAB_WORKER_URL;

  try {
    const url = new URL(candidate);
    const supportedProtocol = ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
    const unsafeRemoteLoopback =
      isLoopbackHostname(url.hostname) && !isLoopbackHostname(pageHostname);

    if (!supportedProtocol || unsafeRemoteLoopback) {
      return DEFAULT_COLLAB_WORKER_URL;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_COLLAB_WORKER_URL;
  }
}
