import * as Y from "yjs";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_REQUEST_BODY_BYTES,
  MAX_SNAPSHOTS,
  MAX_WS_BINARY_BYTES,
  nextServerTimestamp,
  snapshotTimestamp,
  validateMemoDraftPayload,
} from "./draftValidation.mjs";
import {
  jsonEqual,
  mergeDraftSnapshot,
  mergeStamps,
} from "./draftMerge.mjs";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const MAP_NAME = "form";
const DATA_KEY = "data";
const UPDATED_AT_KEY = "updatedAt";
const UPDATED_BY_KEY = "updatedBy";
const REVISION_KEY = "revision";
const STAMPS_KEY = "stamps";
const SNAPSHOT_PREFIX = "snapshot:";
const MAX_RECEIPTS = 200;

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

function roomStateFromDoc(doc) {
  const map = doc.getMap(MAP_NAME);
  const draft = map.get(DATA_KEY);
  return {
    map,
    draft: draft && typeof draft === "object" ? draft : null,
    updatedAt: Number(map.get(UPDATED_AT_KEY) || 0),
    updatedBy: String(map.get(UPDATED_BY_KEY) || ""),
    revision: Number(map.get(REVISION_KEY) || 0),
    stamps: map.get(STAMPS_KEY) ?? {},
  };
}

export class MemoRoom {
  constructor(state) {
    this.state = state;
    this.doc = new Y.Doc();
    this.sessions = new Map();
    this.loaded = false;
    this.messageQueue = Promise.resolve();
    this.receipts = new Map();
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
    const room = roomStateFromDoc(this.doc);
    if (!room.draft) {
      const latestDraft = await this.state.storage.get("latestDraft");
      if (latestDraft?.draft) {
        this.doc.transact(() => {
          room.map.set(DATA_KEY, latestDraft.draft);
          room.map.set(UPDATED_AT_KEY, Number(latestDraft.updatedAt) || Date.now());
          room.map.set(UPDATED_BY_KEY, String(latestDraft.updatedBy || ""));
          room.map.set(REVISION_KEY, 1);
          room.map.set(STAMPS_KEY, {});
        });
      }
    }
    const storedReceipts = await this.state.storage.get("saveReceipts");
    if (Array.isArray(storedReceipts)) {
      for (const entry of storedReceipts) {
        if (Array.isArray(entry) && typeof entry[0] === "string") {
          this.receipts.set(entry[0], entry[1]);
        }
      }
    }
    this.loaded = true;
  }

  async persistDoc() {
    await this.state.storage.put(
      "ydoc",
      Y.encodeStateAsUpdate(this.doc).buffer,
    );

    const room = roomStateFromDoc(this.doc);
    if (room.draft) {
      await this.state.storage.put("latestDraft", {
        draft: room.draft,
        updatedAt: room.updatedAt,
        updatedBy: room.updatedBy,
      });
    }
  }

  async persistReceipts() {
    const entries = [...this.receipts.entries()].slice(-MAX_RECEIPTS);
    this.receipts = new Map(entries);
    await this.state.storage.put("saveReceipts", entries);
  }

  receiptFor(saveId) {
    if (!saveId) return null;
    const entry = this.receipts.get(saveId);
    return entry && typeof entry === "object" ? entry : null;
  }

  /**
   * Merges one sender's snapshot into the room draft. The sender supplies the
   * draft it started from (`base`), its own edit (`draft`), and its stamp table,
   * so a field that only the sender touched survives even when another user
   * saved in between.
   */
  async saveDraftSnapshot(message, exceptSessionId = "") {
    const saveId = typeof message.saveId === "string"
      ? message.saveId.slice(0, 256)
      : "";
    const replay = this.receiptFor(saveId);
    if (replay) return { ...replay, replayed: true };

    const validation = validateMemoDraftPayload(message?.draft);
    if (!validation.ok) return null;

    const userId = String(message.user?.id || message.userId || "unknown").slice(0, 128);
    const room = roomStateFromDoc(this.doc);
    const currentRevision = room.revision;
    const requestedRevision = Number(message.baseRevision);
    const declaredBase = message?.base;
    const declaredBaseIsDraft = declaredBase !== undefined &&
      declaredBase !== null &&
      validateMemoDraftPayload(declaredBase).ok;
    const revisionMatches = Number.isFinite(requestedRevision) &&
      requestedRevision === currentRevision;
    // A declared base is trusted as the ancestor of the sender's edit. An
    // explicit `null` base means "the room was empty when I branched", which is
    // only believable when the sender saw the current revision. Anything else
    // (including legacy senders with no base at all) falls back to the room
    // state, which can only add fields the room never had.
    const hasComparableBase = declaredBaseIsDraft ||
      (declaredBase === null && revisionMatches);

    const updatedAt = nextServerTimestamp(
      room.updatedAt,
      message.updatedAt,
    );
    // Conflicts are ranked by the sender's intended write time (clamped), not by
    // arrival order, so a save that was queued while a peer was offline cannot
    // win a field simply by arriving later.
    const requestedAt = Number(message.updatedAt);
    const conflictAt = Number.isFinite(requestedAt)
      ? Math.min(Math.max(0, requestedAt), Date.now() + MAX_CLOCK_SKEW_MS)
      : updatedAt;
    const merged = mergeDraftSnapshot({
      // Without a base that matches the room revision the merge cannot know what
      // the sender changed, so treat the room draft as the base: the sender then
      // only contributes fields the room never touched.
      base: hasComparableBase ? declaredBase : room.draft,
      current: room.draft,
      incoming: message.draft,
      timestamps: room.stamps,
      incomingTimestamps: message.timestamps,
      incomingAt: conflictAt || updatedAt,
    });

    if (!merged.draft) return null;

    const revision = currentRevision + 1;
    const nextStamps = mergeStamps(
      room.stamps,
      merged.timestamps,
    ) ?? {};

    this.doc.transact(() => {
      room.map.set(DATA_KEY, merged.draft);
      room.map.set(UPDATED_AT_KEY, updatedAt);
      room.map.set(UPDATED_BY_KEY, userId);
      room.map.set(REVISION_KEY, revision);
      room.map.set(STAMPS_KEY, nextStamps);
      room.map.set(snapshotKey(updatedAt, userId), merged.draft);
      pruneSnapshots(room.map);
    });

    await this.persistDoc();

    const result = {
      draft: merged.draft,
      updatedAt,
      updatedBy: userId,
      revision,
      saveId,
      clientId: typeof message.clientId === "string"
        ? message.clientId.slice(0, 128)
        : "",
      mergedKeys: merged.mergedKeys,
      senderDraftMatched: jsonEqual(merged.draft, message.draft),
    };

    if (saveId) {
      this.receipts.set(saveId, {
        draft: merged.draft,
        updatedAt,
        updatedBy: userId,
        revision,
        clientId: result.clientId,
        mergedKeys: merged.mergedKeys,
        senderDraftMatched: result.senderDraftMatched,
      });
      await this.persistReceipts();
    }

    // Peers only ever receive the merged room state, never the raw payload, so
    // a late or duplicated save can no longer roll a peer's work back.
    this.broadcast(JSON.stringify({
      type: "draft-update",
      draft: merged.draft,
      updatedAt,
      updatedBy: userId,
      revision,
      saveId,
      clientId: result.clientId,
      mergedKeys: merged.mergedKeys,
    }), exceptSessionId);

    return result;
  }

  send(session, payload) {
    try {
      session.socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
      return true;
    } catch {
      this.closeSession(session.sessionId);
      return false;
    }
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
      const rawMessage = await readLimitedText(request, MAX_REQUEST_BODY_BYTES);
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
          revision: saved?.revision,
          mergedDraft: saved?.draft,
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
      const room = roomStateFromDoc(this.doc);
      return Response.json(
        {
          ok: true,
          users: this.sessions.size,
          hasDraft: Boolean(room.draft),
          revision: room.revision,
        },
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
    const session = { socket, sessionId, user: null, initialSyncComplete: false };
    this.sessions.set(sessionId, session);
    const room = roomStateFromDoc(this.doc);
    socket.send(JSON.stringify({
      type: "room-snapshot",
      draft: room.draft,
      updatedAt: room.updatedAt,
      updatedBy: room.updatedBy,
      revision: room.revision,
    }));
    socket.send(Y.encodeStateAsUpdate(this.doc));

    socket.addEventListener("message", (event) => {
      this.enqueue(async () => {
        if (typeof event.data === "string") {
          if (byteLength(event.data) > MAX_REQUEST_BODY_BYTES) {
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
      const saveId = typeof message.saveId === "string"
        ? message.saveId.slice(0, 256)
        : "";
      if (saved) {
        this.send(session, {
          type: "saved",
          saveId,
          updatedAt: saved.updatedAt,
          revision: saved.revision,
          replayed: Boolean(saved.replayed),
          // Present only when the room landed somewhere other than the payload
          // the sender sent, so the sender can rebase onto the merged result.
          mergedDraft: saved.senderDraftMatched ? undefined : saved.draft,
          mergedKeys: saved.mergedKeys,
        });
      } else {
        this.send(session, { type: "save-error", saveId, error: "draft_invalid" });
      }
    }
  }

  broadcast(message, exceptSessionId = "") {
    for (const [sessionId, session] of this.sessions) {
      if (sessionId === exceptSessionId) continue;
      this.send(session, message);
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
