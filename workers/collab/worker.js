import * as Y from "yjs";
import {
  MAX_HTTP_BODY_BYTES,
  MAX_SNAPSHOTS,
  MAX_WS_BINARY_BYTES,
  nextServerTimestamp,
  snapshotTimestamp,
  validateMemoDraftPayload,
} from "./draftValidation.mjs";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const MAP_NAME = "form";
const DATA_KEY = "data";
const UPDATED_AT_KEY = "updatedAt";
const UPDATED_BY_KEY = "updatedBy";
const SNAPSHOT_PREFIX = "snapshot:";

async function toUint8Array(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data?.arrayBuffer) return new Uint8Array(await data.arrayBuffer());
  return null;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function snapshotKey(updatedAt, userId) {
  return `${SNAPSHOT_PREFIX}${updatedAt}:${encodeURIComponent(userId || "unknown")}`;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

async function readLimitedText(request, limit) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function pruneSnapshots(map) {
  const keys = [];
  map.forEach((_, key) => {
    if (snapshotTimestamp(key) >= 0) keys.push(key);
  });
  keys
    .sort((left, right) =>
      snapshotTimestamp(right) - snapshotTimestamp(left) ||
      right.localeCompare(left)
    )
    .slice(MAX_SNAPSHOTS)
    .forEach((key) => map.delete(key));
}

function latestDraftFromDoc(doc) {
  const map = doc.getMap(MAP_NAME);
  const draft = map.get(DATA_KEY);
  if (!draft || typeof draft !== "object") return null;

  return {
    draft,
    updatedAt: Number(map.get(UPDATED_AT_KEY) || Date.now()),
    updatedBy: String(map.get(UPDATED_BY_KEY) || ""),
  };
}

export class MemoRoom {
  constructor(state) {
    this.state = state;
    this.doc = new Y.Doc();
    this.sessions = new Map();
    this.loaded = false;
    this.messageQueue = Promise.resolve();
  }

  enqueue(task) {
    const next = this.messageQueue.then(task, task);
    this.messageQueue = next.catch(() => {});
    return next;
  }

  logError(event, error, sessionId = "") {
    console.error("memo_collab_error", {
      event,
      sessionId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  async load() {
    if (this.loaded) return;
    const stored = await this.state.storage.get("ydoc");
    if (stored) Y.applyUpdate(this.doc, await toUint8Array(stored));
    if (!latestDraftFromDoc(this.doc)) {
      const latestDraft = await this.state.storage.get("latestDraft");
      if (latestDraft?.draft) {
        await this.saveDraftSnapshot(latestDraft, "");
      }
    }
    this.loaded = true;
  }

  async persistDoc() {
    await this.state.storage.put(
      "ydoc",
      Y.encodeStateAsUpdate(this.doc).buffer,
    );

    const latestDraft = latestDraftFromDoc(this.doc);
    if (latestDraft) {
      await this.state.storage.put("latestDraft", latestDraft);
    }
  }

  async saveDraftSnapshot(message, exceptSessionId = "") {
    const validation = validateMemoDraftPayload(message?.draft);
    if (!validation.ok) return null;

    const userId = String(message.user?.id || message.userId || "unknown").slice(0, 128);
    const map = this.doc.getMap(MAP_NAME);
    const updatedAt = nextServerTimestamp(
      map.get(UPDATED_AT_KEY),
      message.updatedAt,
    );

    this.doc.transact(() => {
      map.set(DATA_KEY, message.draft);
      map.set(UPDATED_AT_KEY, updatedAt);
      map.set(UPDATED_BY_KEY, userId);
      map.set(snapshotKey(updatedAt, userId), message.draft);
      pruneSnapshots(map);
    });

    await this.persistDoc();
    this.broadcast(JSON.stringify({
      type: "draft-update",
      draft: message.draft,
      updatedAt,
      updatedBy: userId,
    }), exceptSessionId);
    return { draft: message.draft, updatedAt, updatedBy: userId };
  }

  async fetch(request) {
    await this.load();

    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return Response.json(
          { ok: false, error: "content_type_invalid" },
          { status: 415, headers: CORS_HEADERS },
        );
      }
      const rawMessage = await readLimitedText(request, MAX_HTTP_BODY_BYTES);
      if (rawMessage === null) {
        return Response.json(
          { ok: false, error: "payload_too_large" },
          { status: 413, headers: CORS_HEADERS },
        );
      }
      const message = safeJsonParse(rawMessage);
      const saved = message?.initialSyncComplete === true
        ? await this.enqueue(() => this.saveDraftSnapshot(message, ""))
        : null;
      return Response.json(
        {
          ok: Boolean(saved),
          updatedAt: saved?.updatedAt,
          error: saved ? undefined : "draft_invalid",
        },
        { status: saved ? 200 : 400, headers: CORS_HEADERS },
      );
    }

    if (request.method !== "GET") {
      return Response.json(
        { ok: false, error: "method_not_allowed" },
        { status: 405, headers: { ...CORS_HEADERS, allow: "GET, POST, OPTIONS" } },
      );
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json(
        { ok: true, users: this.sessions.size, hasDraft: Boolean(latestDraftFromDoc(this.doc)) },
        { headers: CORS_HEADERS },
      );
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.handleSession(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  handleSession(socket) {
    socket.accept();
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { socket, user: null, initialSyncComplete: false });
    const roomSnapshot = latestDraftFromDoc(this.doc);
    socket.send(JSON.stringify({
      type: "room-snapshot",
      draft: roomSnapshot?.draft ?? null,
      updatedAt: roomSnapshot?.updatedAt ?? 0,
      updatedBy: roomSnapshot?.updatedBy ?? "",
    }));
    socket.send(Y.encodeStateAsUpdate(this.doc));

    socket.addEventListener("message", (event) => {
      this.enqueue(async () => {
        if (typeof event.data === "string") {
          if (byteLength(event.data) > MAX_HTTP_BODY_BYTES) {
            socket.close(1009, "Message too large");
            this.closeSession(sessionId);
            return;
          }
          await this.handleTextMessage(sessionId, event.data);
          return;
        }

        const update = await toUint8Array(event.data);
        if (!update || update.byteLength > MAX_WS_BINARY_BYTES) {
          socket.close(1009, "Update too large");
          this.closeSession(sessionId);
          return;
        }
        this.logError("unexpected_binary_message", new Error("UnexpectedBinaryMessage"), sessionId);
      }).catch((error) => this.logError("session_message", error, sessionId));
    });

    socket.addEventListener("close", () => this.closeSession(sessionId));
    socket.addEventListener("error", () => this.closeSession(sessionId));
  }

  async handleTextMessage(sessionId, rawMessage) {
    const message = safeJsonParse(rawMessage);
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (message?.type === "presence" && message.user) {
      session.user = {
        id: String(message.user.id || sessionId).slice(0, 128),
        name: String(message.user.name || "User").slice(0, 32),
        color: /^#[0-9a-f]{6}$/i.test(message.user.color)
          ? message.user.color
          : "#1b4d78",
      };
      this.broadcastPresence();
      return;
    }

    if (message?.type === "sync-ready") {
      session.initialSyncComplete = true;
      return;
    }

    if (message?.type === "draft-save" && session.initialSyncComplete) {
      const saved = await this.saveDraftSnapshot(message, sessionId);
      if (saved) {
        try {
          session.socket.send(JSON.stringify({
            type: "saved",
            saveId: typeof message.saveId === "string" ? message.saveId.slice(0, 256) : "",
            updatedAt: saved.updatedAt,
          }));
        } catch {
          this.closeSession(sessionId);
        }
      } else {
        try {
          session.socket.send(JSON.stringify({
            type: "save-error",
            saveId: typeof message.saveId === "string" ? message.saveId.slice(0, 256) : "",
            error: "draft_invalid",
          }));
        } catch {
          this.closeSession(sessionId);
        }
      }
    }
  }

  broadcast(message, exceptSessionId = "") {
    for (const [sessionId, session] of this.sessions) {
      if (sessionId === exceptSessionId) continue;
      try {
        session.socket.send(message);
      } catch {
        this.closeSession(sessionId);
      }
    }
  }

  broadcastPresence() {
    const users = [...this.sessions.values()]
      .map((session) => session.user)
      .filter(Boolean);
    this.broadcast(JSON.stringify({ type: "presence", users }));
  }

  closeSession(sessionId) {
    if (!this.sessions.delete(sessionId)) return;
    this.broadcastPresence();
  }
}

const worker = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "generate-memo-collab" },
        { headers: CORS_HEADERS },
      );
    }

    const match = url.pathname.match(/^\/collab\/([^/]+)$/);
    if (!match) {
      return Response.json(
        { ok: false, error: "Use /collab/:docId for websocket sync." },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    let docId = "";
    try {
      docId = decodeURIComponent(match[1]);
    } catch {
      return Response.json(
        { ok: false, error: "Invalid room id." },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    if (!/^generate-memo:[A-Za-z0-9_-]{1,64}$/.test(docId)) {
      return Response.json(
        { ok: false, error: "Invalid room id." },
        { status: 400, headers: CORS_HEADERS },
      );
    }
    const objectId = env.MEMO_ROOMS.idFromName(docId);
    return env.MEMO_ROOMS.get(objectId).fetch(request);
  },
};

export default worker;
