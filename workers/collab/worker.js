import * as Y from "yjs";

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
    if (!message?.draft || typeof message.draft !== "object") return false;

    const updatedAt = Number(message.updatedAt || Date.now());
    const userId = String(message.user?.id || message.userId || "unknown");
    const map = this.doc.getMap(MAP_NAME);
    const before = Y.encodeStateVector(this.doc);

    this.doc.transact(() => {
      map.set(DATA_KEY, message.draft);
      map.set(UPDATED_AT_KEY, updatedAt);
      map.set(UPDATED_BY_KEY, userId);
      map.set(snapshotKey(updatedAt, userId), message.draft);
    });

    await this.persistDoc();
    const update = Y.encodeStateAsUpdate(this.doc, before);
    if (update.byteLength > 0) {
      this.broadcast(update, exceptSessionId);
    }
    return true;
  }

  async fetch(request) {
    await this.load();

    if (request.method === "POST") {
      const message = safeJsonParse(await request.text());
      const saved = message?.initialSyncComplete === true
        ? await this.saveDraftSnapshot(message, "")
        : false;
      return Response.json(
        { ok: saved },
        { status: saved ? 200 : 400, headers: CORS_HEADERS },
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
    }));
    socket.send(Y.encodeStateAsUpdate(this.doc));

    socket.addEventListener("message", async (event) => {
      if (typeof event.data === "string") {
        await this.handleTextMessage(sessionId, event.data);
        return;
      }

      const update = await toUint8Array(event.data);
      const session = this.sessions.get(sessionId);
      if (!update || !session?.initialSyncComplete) return;
      Y.applyUpdate(this.doc, update);
      await this.persistDoc();
      this.broadcast(update, sessionId);
      socket.send(JSON.stringify({ type: "saved" }));
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
        id: String(message.user.id || sessionId),
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
        session.socket.send(JSON.stringify({ type: "saved" }));
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

    const docId = decodeURIComponent(match[1]).slice(0, 128);
    const objectId = env.MEMO_ROOMS.idFromName(docId);
    return env.MEMO_ROOMS.get(objectId).fetch(request);
  },
};

export default worker;
