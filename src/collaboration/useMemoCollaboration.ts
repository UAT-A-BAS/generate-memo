"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Y from "yjs";
import type { MemoDraft } from "@/types/memo";
import { normalizeMemoDraft } from "@/templates/bcaMemoTemplate";
import { saveCollaboratorIdentity } from "@/collaboration/collaboratorIdentity";
import {
  isPowerAppsRoomId,
  powerAppsPortalRoomLink,
  powerAppsRoomId,
  type PowerAppsLaunchContext,
} from "@/collaboration/powerAppsPortal";
import {
  COLLABORATION_DISABLED,
  DEFAULT_COLLAB_WORKER_URL,
  resolveCollaborationWorkerBaseUrl,
} from "@/collaboration/workerUrl";
import {
  buildChangeStamps,
  jsonEqual,
  mergeDraftSnapshot,
  type StampTable,
} from "@/collaboration/draftMerge";

type ConnectionStatus = "offline" | "syncing" | "connected" | "saved";

type Collaborator = {
  id: string;
  name: string;
  color: string;
  isLocal: boolean;
};

type CollaborationState = {
  active: boolean;
  roomId: string;
  status: ConnectionStatus;
  collaborators: Collaborator[];
  lastSyncedAt?: string;
  lastError?: string;
};

type PresenceUser = {
  id: string;
  name: string;
  color: string;
};

type PresenceMessage = {
  type?: string;
  users?: PresenceUser[];
  draft?: MemoDraft;
  mergedDraft?: MemoDraft;
  updatedAt?: number;
  updatedBy?: string;
  revision?: number;
  saveId?: string;
  clientId?: string;
};

type PendingSave = {
  saveId: string;
  draft: MemoDraft;
  base: MemoDraft | null;
  baseRevision: number;
  timestamps: StampTable;
  payload: string;
};

const ROOM_PARAM = "room";
const CONFIGURED_WORKER_BASE_URL =
  process.env.NEXT_PUBLIC_COLLAB_WORKER_URL ?? DEFAULT_COLLAB_WORKER_URL;
const DOC_PREFIX = "generate-memo";
const MAP_NAME = "form";
const DATA_KEY = "data";
const UPDATED_AT_KEY = "updatedAt";
const UPDATED_BY_KEY = "updatedBy";
const REVISION_KEY = "revision";
const SNAPSHOT_PREFIX = "snapshot:";
const SYNC_ACK_TIMEOUT_MS = 8_000;
const DEFAULT_IDLE_TIMERS = {
  idleMs: 5 * 60 * 1000,
  hiddenGraceMs: 60 * 1000,
  autosaveMs: 2500,
  reconnectBaseMs: 1800,
  reconnectMaxMs: 30000,
  idleCloseDelayMs: 150,
};

type IdleTimers = typeof DEFAULT_IDLE_TIMERS;
type FlushOptions = {
  keepalive?: boolean;
  persistHttp?: boolean;
  sendSocket?: boolean;
};
type CollaborationWindow = Window & typeof globalThis & {
  __MEMO_COLLAB_IDLE_TIMERS__?: Partial<IdleTimers>;
};

function idleTimers(): IdleTimers {
  if (typeof window === "undefined") return DEFAULT_IDLE_TIMERS;
  const overrides = (window as CollaborationWindow).__MEMO_COLLAB_IDLE_TIMERS__ ?? {};
  return {
    idleMs: Math.max(1, Number(overrides.idleMs ?? DEFAULT_IDLE_TIMERS.idleMs)),
    hiddenGraceMs: Math.max(1, Number(overrides.hiddenGraceMs ?? DEFAULT_IDLE_TIMERS.hiddenGraceMs)),
    autosaveMs: Math.max(1, Number(overrides.autosaveMs ?? DEFAULT_IDLE_TIMERS.autosaveMs)),
    reconnectBaseMs: Math.max(1, Number(overrides.reconnectBaseMs ?? DEFAULT_IDLE_TIMERS.reconnectBaseMs)),
    reconnectMaxMs: Math.max(1, Number(overrides.reconnectMaxMs ?? DEFAULT_IDLE_TIMERS.reconnectMaxMs)),
    idleCloseDelayMs: Math.max(0, Number(overrides.idleCloseDelayMs ?? DEFAULT_IDLE_TIMERS.idleCloseDelayMs)),
  };
}

function roomFromUrl() {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get(ROOM_PARAM) ?? "";
}

function setRoomUrl(roomId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set(ROOM_PARAM, roomId);
  } else {
    url.searchParams.delete(ROOM_PARAM);
  }
  window.history.replaceState({}, "", url.toString());
}

function randomHex(bytes: number) {
  const values = new Uint8Array(bytes);
  window.crypto.getRandomValues(values);
  return Array.from(values, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomRoomId() {
  return randomHex(8);
}

function formatSyncTime(date = new Date()) {
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/:/g, ".");
}

function collaborationDocId(roomId: string) {
  return `${DOC_PREFIX}:${roomId}`;
}

function workerBaseUrl() {
  return resolveCollaborationWorkerBaseUrl(
    CONFIGURED_WORKER_BASE_URL,
    window.location.hostname,
  );
}

function workerWebSocketUrl(roomId: string) {
  const url = new URL(
    `/collab/${encodeURIComponent(collaborationDocId(roomId))}`,
    workerBaseUrl(),
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function workerHttpUrl(roomId: string) {
  return new URL(
    `/collab/${encodeURIComponent(collaborationDocId(roomId))}`,
    workerBaseUrl(),
  ).toString();
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as PresenceMessage;
  } catch {
    return {};
  }
}

/** Compares two drafts while ignoring the local wall-clock field. */
function draftSyncKey(draft: MemoDraft) {
  const syncDraft = {
    ...normalizeMemoDraft(draft),
    updatedAt: "",
  };
  return JSON.stringify(syncDraft);
}

/** Newest room state carried by the Yjs document, used for binary hydration. */
function sharedDraftStateFromMap(map: Y.Map<unknown>) {
  const revision = Number(map.get(REVISION_KEY) || 0);
  const updatedBy = String(map.get(UPDATED_BY_KEY) || "remote");
  const direct = map.get(DATA_KEY);

  if (direct && typeof direct === "object") {
    return {
      draft: normalizeMemoDraft(direct as Partial<MemoDraft>),
      updatedAt: Number(map.get(UPDATED_AT_KEY) || 0) || Date.now(),
      updatedBy,
      revision,
    };
  }

  let latestData: unknown = null;
  let latestUpdatedAt = 0;
  map.forEach((value, key) => {
    if (typeof key !== "string" || !key.startsWith(SNAPSHOT_PREFIX)) return;
    if (!value || typeof value !== "object") return;
    const at = Number(key.slice(SNAPSHOT_PREFIX.length).split(":")[0] || "0");
    if (at >= latestUpdatedAt) {
      latestUpdatedAt = at;
      latestData = value;
    }
  });

  if (!latestData || typeof latestData !== "object") return null;
  return {
    draft: normalizeMemoDraft(latestData as Partial<MemoDraft>),
    updatedAt: latestUpdatedAt || Date.now(),
    updatedBy,
    revision,
  };
}

export function collaborationLink(roomId: string) {
  if (typeof window === "undefined") return "";
  if (isPowerAppsRoomId(roomId)) return powerAppsPortalRoomLink(roomId);
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_PARAM, roomId);
  return url.toString();
}

export function useMemoCollaboration(
  draft: MemoDraft,
  replaceDraft: (draft: MemoDraft, status?: "idle" | "loaded" | "saved" | "imported" | "error") => void,
  collaboratorName: string,
  powerAppsContext: PowerAppsLaunchContext | null = null,
) {
  const [state, setState] = useState<CollaborationState>({
    active: false,
    roomId: "",
    status: "offline",
    collaborators: [],
  });
  const docRef = useRef<Y.Doc | null>(null);
  const mapRef = useRef<Y.Map<unknown> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sharedUpdateTimerRef = useRef<number | null>(null);
  const saveRetryTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const hiddenTimerRef = useRef<number | null>(null);
  const applyingRemoteRef = useRef(false);
  const syncAckTimerRef = useRef<number | null>(null);
  const pendingSaveIdRef = useRef("");
  const saveSequenceRef = useRef(0);
  const pendingPresenceRef = useRef<PresenceUser[] | null>(null);
  const initialSyncCompleteRef = useRef(false);
  const expectedInitialDraftKeyRef = useRef("");
  const activeRoomRef = useRef("");
  const userRef = useRef<PresenceUser | null>(null);
  const draftRef = useRef(draft);
  const flushSharedDraftRef = useRef<((options?: FlushOptions) => void) | null>(null);
  const resumeSocketRef = useRef<(() => void) | null>(null);
  const idlePausedRef = useRef(false);
  const suppressReconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const saveRetryAttemptRef = useRef(0);
  const latestIdentityNameRef = useRef(collaboratorName);
  const clientIdRef = useRef("");
  /** Room state the local edits were branched from. */
  const baseDraftRef = useRef<MemoDraft | null>(null);
  /** Latest room state known from the server. */
  const roomDraftRef = useRef<MemoDraft | null>(null);
  /** Server revision that matches `roomDraftRef`. */
  const roomRevisionRef = useRef(0);
  /** Draft key of the last state acknowledged as in sync. */
  const localBaselineRef = useRef("");
  /** Save currently waiting for a server acknowledgement. */
  const pendingRef = useRef<PendingSave | null>(null);

  useLayoutEffect(() => {
    draftRef.current = draft;
    if (
      activeRoomRef.current &&
      !initialSyncCompleteRef.current &&
      expectedInitialDraftKeyRef.current &&
      draftSyncKey(draft) === expectedInitialDraftKeyRef.current
    ) {
      initialSyncCompleteRef.current = true;
      expectedInitialDraftKeyRef.current = "";
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "sync-ready" }));
      }
    }
  }, [draft]);

  useEffect(() => {
    latestIdentityNameRef.current = collaboratorName;
  }, [collaboratorName]);

  const updateStatus = useCallback((
    status: ConnectionStatus,
    lastSyncedAt?: string,
    lastError?: string,
  ) => {
    setState((current) => ({
      ...current,
      status,
      lastSyncedAt: lastSyncedAt ?? current.lastSyncedAt,
      lastError: lastError ?? (status === "offline" ? current.lastError : undefined),
    }));
  }, []);

  const clearSaveRetry = useCallback(() => {
    if (saveRetryTimerRef.current) window.clearTimeout(saveRetryTimerRef.current);
    saveRetryTimerRef.current = null;
    saveRetryAttemptRef.current = 0;
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (sharedUpdateTimerRef.current) window.clearTimeout(sharedUpdateTimerRef.current);
    if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
    if (saveRetryTimerRef.current) window.clearTimeout(saveRetryTimerRef.current);
    reconnectTimerRef.current = null;
    sharedUpdateTimerRef.current = null;
    syncAckTimerRef.current = null;
    saveRetryTimerRef.current = null;
    saveRetryAttemptRef.current = 0;
    pendingSaveIdRef.current = "";
    pendingPresenceRef.current = null;
  }, []);

  const clearIdleTimers = useCallback(() => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    if (hiddenTimerRef.current) window.clearTimeout(hiddenTimerRef.current);
    idleTimerRef.current = null;
    hiddenTimerRef.current = null;
  }, []);

  const disconnect = useCallback((clearUrl = true) => {
    clearTimers();
    clearIdleTimers();
    suppressReconnectRef.current = true;
    idlePausedRef.current = false;
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
    }
    socketRef.current = null;
    docRef.current?.destroy();
    docRef.current = null;
    mapRef.current = null;
    activeRoomRef.current = "";
    baseDraftRef.current = null;
    roomDraftRef.current = null;
    roomRevisionRef.current = 0;
    localBaselineRef.current = "";
    pendingRef.current = null;
    initialSyncCompleteRef.current = false;
    expectedInitialDraftKeyRef.current = "";
    reconnectAttemptRef.current = 0;
    flushSharedDraftRef.current = null;
    resumeSocketRef.current = null;
    if (clearUrl) setRoomUrl("");
    setState({
      active: false,
      roomId: "",
      status: "offline",
      collaborators: [],
    });
  }, [clearTimers, clearIdleTimers]);

  const connect = useCallback((
    roomId: string,
    seedDraft: MemoDraft | null,
    updateUrl: boolean,
    identityName: string,
  ) => {
    if (COLLABORATION_DISABLED) {
      setState((current) => ({
        ...current,
        status: "offline",
        lastError: "Kolaborasi dinonaktifkan pada versi offline.",
      }));
      return;
    }
    const cleanRoom = roomId.trim();
    const cleanName = (powerAppsContext?.name ?? identityName).trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleanRoom) || !cleanName) {
      setState((current) => ({
        ...current,
        status: "offline",
        lastError: "ID room tidak valid.",
      }));
      return;
    }
    if (isPowerAppsRoomId(cleanRoom) && !powerAppsContext) {
      setState((current) => ({
        ...current,
        status: "offline",
        lastError: "Room Microsoft 365 harus dibuka melalui portal Power Apps.",
      }));
      return;
    }

    disconnect(false);
    idlePausedRef.current = false;
    suppressReconnectRef.current = false;
    reconnectAttemptRef.current = 0;
    latestIdentityNameRef.current = cleanName;
    if (updateUrl) setRoomUrl(cleanRoom);

    const doc = new Y.Doc();
    const map = doc.getMap(MAP_NAME);
    const user = powerAppsContext
      ? {
          id: powerAppsContext.userId,
          name: powerAppsContext.name,
          color: powerAppsContext.color,
        }
      : saveCollaboratorIdentity(cleanName);
    let pendingSeed = seedDraft ? normalizeMemoDraft(draftRef.current) : null;
    const clientId = clientIdRef.current || `c_${randomHex(8)}`;
    clientIdRef.current = clientId;

    docRef.current = doc;
    mapRef.current = map;
    userRef.current = user;
    activeRoomRef.current = cleanRoom;
    baseDraftRef.current = seedDraft ? normalizeMemoDraft(draftRef.current) : null;
    roomDraftRef.current = null;
    roomRevisionRef.current = 0;
    localBaselineRef.current = draftSyncKey(draftRef.current);
    pendingRef.current = null;
    pendingSaveIdRef.current = "";
    initialSyncCompleteRef.current = false;
    expectedInitialDraftKeyRef.current = "";

    function sendPresence() {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "presence", user }));
    }

    function applyPresence(users: PresenceUser[]) {
      setState((current) => ({
        ...current,
        collaborators: users.map((presence) => ({
          ...presence,
          isLocal: presence.id === user.id,
        })),
      }));
    }

    function flushPendingPresence() {
      if (!initialSyncCompleteRef.current || !pendingPresenceRef.current) return;
      const users = pendingPresenceRef.current;
      pendingPresenceRef.current = null;
      applyPresence(users);
    }

    function localIsDirty() {
      return draftSyncKey(draftRef.current) !== localBaselineRef.current;
    }

    function clearSyncAck(saveId?: string) {
      if (saveId && saveId !== pendingSaveIdRef.current) return false;
      if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
      syncAckTimerRef.current = null;
      pendingSaveIdRef.current = "";
      return true;
    }

    function armSyncAckTimeout(saveId: string) {
      if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
      pendingSaveIdRef.current = saveId;
      syncAckTimerRef.current = window.setTimeout(() => {
        if (pendingSaveIdRef.current !== saveId) return;
        syncAckTimerRef.current = null;
        pendingSaveIdRef.current = "";
        updateStatus("offline");
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      }, SYNC_ACK_TIMEOUT_MS);
    }

    function buildMessage(normalized: MemoDraft, at: number, saveId: string): PendingSave {
      const base = baseDraftRef.current ?? roomDraftRef.current;
      const timestamps = buildChangeStamps(base, normalized, at);
      return {
        saveId,
        draft: normalized,
        base: base ?? null,
        baseRevision: roomRevisionRef.current,
        timestamps,
        payload: JSON.stringify({
          type: "draft-save",
          saveId,
          clientId,
          base: base ?? null,
          baseRevision: roomRevisionRef.current,
          draft: normalized,
          timestamps,
          updatedAt: at,
          user,
          initialSyncComplete: true,
        }),
      };
    }

    /**
     * Adopts the room state as the new base. Unsaved local edits are re-applied
     * on top instead of being dropped or overwriting everyone else's work.
     */
    function adoptRoomDraft(remote: MemoDraft, revision: number, sentDraft?: MemoDraft) {
      const dirty = localIsDirty();
      roomDraftRef.current = remote;
      if (Number.isFinite(revision)) roomRevisionRef.current = revision;

      if (!dirty) {
        baseDraftRef.current = remote;
        localBaselineRef.current = draftSyncKey(remote);
        if (!jsonEqual(remote, draftRef.current)) {
          applyingRemoteRef.current = true;
          try {
            replaceDraft(remote, "loaded");
          } finally {
            applyingRemoteRef.current = false;
          }
        }
        return;
      }

      const branch = sentDraft ?? baseDraftRef.current;
      const localNow = normalizeMemoDraft(draftRef.current);
      const rebased = mergeDraftSnapshot({
        base: branch ?? remote,
        current: remote,
        incoming: localNow,
        timestamps: {},
        incomingTimestamps: buildChangeStamps(branch ?? remote, localNow, Date.now()),
        incomingAt: Date.now(),
      });
      baseDraftRef.current = remote;
      localBaselineRef.current = draftSyncKey(remote);
      if (rebased.draft && !jsonEqual(rebased.draft, localNow)) {
        applyingRemoteRef.current = true;
        try {
          replaceDraft(rebased.draft, "loaded");
        } finally {
          applyingRemoteRef.current = false;
        }
      }
    }

    function httpFlush(message: PendingSave, keepalive: boolean) {
      void fetch(workerHttpUrl(cleanRoom), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: message.payload,
        keepalive,
        credentials: "omit",
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
        const result = await response.json() as {
          revision?: unknown;
          mergedDraft?: unknown;
        };
        const revision = Number(result.revision);
        const mergedDraft = result.mergedDraft && typeof result.mergedDraft === "object"
          ? normalizeMemoDraft(result.mergedDraft as Partial<MemoDraft>)
          : null;
        if (!mergedDraft) {
          if (Number.isFinite(revision)) roomRevisionRef.current = revision;
          return;
        }
        adoptRoomDraft(mergedDraft, revision, message.draft);
        if (pendingRef.current?.saveId === message.saveId) {
          pendingRef.current = null;
          clearSyncAck(message.saveId);
          updateStatus("saved", formatSyncTime());
        }
      }).catch(() => {
        updateStatus(
          "offline",
          undefined,
          "Draft belum tersimpan ke server. Koneksi akan dicoba kembali.",
        );
      });
    }

    function sendDraftSave(normalized: MemoDraft, at: number) {
      const saveId = `${clientId}:${at}:${++saveSequenceRef.current}`;
      const message = buildMessage(normalized, at, saveId);
      pendingRef.current = message;

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !initialSyncCompleteRef.current) {
        updateStatus("offline");
        return message;
      }
      try {
        socket.send(message.payload);
      } catch {
        updateStatus("offline");
        socket.close();
        return message;
      }
      armSyncAckTimeout(saveId);
      updateStatus("syncing");
      return message;
    }

    function pushPendingEdits() {
      if (!initialSyncCompleteRef.current || !localIsDirty()) return;
      const normalized = normalizeMemoDraft(draftRef.current);
      const message = sendDraftSave(normalized, Date.now());
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        httpFlush(message, false);
      }
    }

    flushSharedDraftRef.current = (options: FlushOptions = {}) => {
      if (
        applyingRemoteRef.current ||
        !activeRoomRef.current ||
        !initialSyncCompleteRef.current
      ) return;
      const normalized = normalizeMemoDraft(draftRef.current);
      const message = sendDraftSave(normalized, Date.now());
      if (options.persistHttp || socketRef.current?.readyState !== WebSocket.OPEN) {
        httpFlush(message, Boolean(options.keepalive));
      }
    };

    function scheduleSaveRetry() {
      if (saveRetryTimerRef.current) window.clearTimeout(saveRetryTimerRef.current);
      const timers = idleTimers();
      const delay = Math.min(
        timers.autosaveMs * (2 ** Math.min(saveRetryAttemptRef.current, 3)),
        timers.reconnectMaxMs,
      );
      saveRetryAttemptRef.current += 1;
      saveRetryTimerRef.current = window.setTimeout(() => {
        saveRetryTimerRef.current = null;
        if (!activeRoomRef.current || idlePausedRef.current) return;
        if (!initialSyncCompleteRef.current) {
          if (socketRef.current?.readyState !== WebSocket.OPEN) {
            idlePausedRef.current = false;
            suppressReconnectRef.current = false;
            resumeSocketRef.current?.();
          }
          return;
        }
        pushPendingEdits();
      }, delay);
    }

    function handleSavedAck(message: PresenceMessage) {
      const saveId = typeof message.saveId === "string" ? message.saveId : "";
      if (saveId && saveId !== pendingSaveIdRef.current) return;
      const inFlight = pendingRef.current;
      const merged = message.mergedDraft && typeof message.mergedDraft === "object"
        ? normalizeMemoDraft(message.mergedDraft as Partial<MemoDraft>)
        : inFlight?.draft ?? null;
      const revision = Number(message.revision);
      const updatedAt = Number(message.updatedAt);

      if (merged) {
        roomDraftRef.current = merged;
        baseDraftRef.current = merged;
        localBaselineRef.current = draftSyncKey(merged);
      }
      if (Number.isFinite(revision)) roomRevisionRef.current = revision;

      if (clearSyncAck(saveId || undefined)) {
        clearSaveRetry();
        updateStatus(
          "saved",
          Number.isFinite(updatedAt) ? formatSyncTime(new Date(updatedAt)) : formatSyncTime(),
        );
      }
      pendingRef.current = null;

      // Edits typed while the save was in flight are re-applied on top.
      if (merged && inFlight && localIsDirty()) {
        const localNow = normalizeMemoDraft(draftRef.current);
        const rebased = mergeDraftSnapshot({
          base: inFlight.draft,
          current: merged,
          incoming: localNow,
          timestamps: {},
          incomingTimestamps: buildChangeStamps(inFlight.draft, localNow, Date.now()),
          incomingAt: Date.now(),
        });
        if (rebased.draft && !jsonEqual(rebased.draft, localNow)) {
          applyingRemoteRef.current = true;
          try {
            replaceDraft(rebased.draft, "loaded");
          } finally {
            applyingRemoteRef.current = false;
          }
        }
      }
    }

    function handleRemoteDraft(message: PresenceMessage) {
      if (!message.draft || typeof message.draft !== "object") return;
      if (message.clientId && message.clientId === clientId) return;
      if (!initialSyncCompleteRef.current) return;
      const revision = Number(message.revision);
      const wasDirty = localIsDirty();
      adoptRoomDraft(
        normalizeMemoDraft(message.draft as Partial<MemoDraft>),
        Number.isFinite(revision) ? revision : roomRevisionRef.current,
      );
      updateStatus(
        "saved",
        formatSyncTime(new Date(Number(message.updatedAt) || Date.now())),
      );
      // Anything still unsaved goes back out so peers see the local edits.
      if (wasDirty) pushPendingEdits();
    }

    function connectSocket() {
      clearTimers();
      initialSyncCompleteRef.current = false;
      expectedInitialDraftKeyRef.current = "";
      let firstServerSync = false;
      updateStatus("syncing");

      let socket: WebSocket;
      try {
        socket = new WebSocket(workerWebSocketUrl(cleanRoom));
      } catch {
        updateStatus("offline");
        return;
      }

      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        if (socket !== socketRef.current) return;
        reconnectAttemptRef.current = 0;
        updateStatus("connected");
        sendPresence();
      });

      socket.addEventListener("message", async (event) => {
        if (socket !== socketRef.current || !docRef.current) return;

        if (typeof event.data === "string") {
          const message = safeJsonParse(event.data);
          if (message.type === "saved") handleSavedAck(message);
          if (message.type === "save-error") {
            const errorMatchesPending = clearSyncAck(
              typeof message.saveId === "string" ? message.saveId : undefined,
            );
            if (!errorMatchesPending) return;
            // A rejected save must not look in-sync, so the retry re-sends it.
            localBaselineRef.current = "";
            pendingRef.current = null;
            updateStatus("syncing");
            scheduleSaveRetry();
          }
          if (message.type === "presence") {
            const users = message.users ?? [];
            if (!initialSyncCompleteRef.current) pendingPresenceRef.current = users;
            else applyPresence(users);
          }
          if (message.type === "draft-update") handleRemoteDraft(message);
          if (message.type === "room-snapshot" && message.draft) {
            const normalized = normalizeMemoDraft(message.draft as Partial<MemoDraft>);
            const revision = Number(message.revision);
            const canHydrateFromSnapshot = !pendingSeed &&
              !pendingRef.current &&
              !localIsDirty();
            if (canHydrateFromSnapshot) {
              adoptRoomDraft(normalized, Number.isFinite(revision) ? revision : 0);
              initialSyncCompleteRef.current = true;
              expectedInitialDraftKeyRef.current = "";
              socket.send(JSON.stringify({ type: "sync-ready" }));
              flushPendingPresence();
              updateStatus(
                "saved",
                formatSyncTime(new Date(Number(message.updatedAt) || Date.now())),
              );
            } else {
              expectedInitialDraftKeyRef.current = draftSyncKey(normalized);
            }
          }
          return;
        }

        const buffer = event.data instanceof ArrayBuffer
          ? event.data
          : await event.data.arrayBuffer();
        Y.applyUpdate(docRef.current, new Uint8Array(buffer), "remote");

        if (firstServerSync) return;
        firstServerSync = true;

        const remoteState = sharedDraftStateFromMap(map);
        const remoteDraft = remoteState?.draft ?? null;
        const remoteRevision = remoteState?.revision ?? 0;
        if (remoteDraft) {
          roomDraftRef.current = remoteDraft;
          roomRevisionRef.current = remoteRevision;
        }

        if (pendingSeed) {
          // The room owner seeds the room with the draft already on screen.
          baseDraftRef.current = remoteDraft;
          initialSyncCompleteRef.current = true;
          socket.send(JSON.stringify({ type: "sync-ready" }));
          pendingSeed = null;
          flushSharedDraftRef.current?.({ sendSocket: true });
        } else if (remoteDraft) {
          adoptRoomDraft(remoteDraft, remoteRevision);
          initialSyncCompleteRef.current = true;
          expectedInitialDraftKeyRef.current = "";
          socket.send(JSON.stringify({ type: "sync-ready" }));
          pushPendingEdits();
        } else {
          baseDraftRef.current = null;
          initialSyncCompleteRef.current = true;
          socket.send(JSON.stringify({ type: "sync-ready" }));
          pushPendingEdits();
        }

        flushPendingPresence();
      });

      socket.addEventListener("close", () => {
        if (socket !== socketRef.current) return;
        socketRef.current = null;
        const hadPendingSave = Boolean(pendingSaveIdRef.current);
        if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
        syncAckTimerRef.current = null;
        pendingSaveIdRef.current = "";
        initialSyncCompleteRef.current = false;
        updateStatus("offline");

        if (suppressReconnectRef.current || idlePausedRef.current || document.hidden) return;
        if (!navigator.onLine) {
          // The online handler resumes the room once the network is back.
          if (hadPendingSave || localIsDirty()) scheduleSaveRetry();
          return;
        }
        const timers = idleTimers();
        const delay = Math.min(
          timers.reconnectBaseMs * (2 ** reconnectAttemptRef.current),
          timers.reconnectMaxMs,
        );
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connectSocket, delay);
        if (hadPendingSave || localIsDirty()) scheduleSaveRetry();
      });

      socket.addEventListener("error", () => {
        if (socket !== socketRef.current) return;
        updateStatus("offline");
      });
    }

    resumeSocketRef.current = connectSocket;
    setState({
      active: true,
      roomId: cleanRoom,
      status: "syncing",
      collaborators: [{ ...user, isLocal: true }],
    });
    connectSocket();
  }, [disconnect, replaceDraft, clearTimers, clearSaveRetry, updateStatus, powerAppsContext]);

  useEffect(() => {
    const roomId = roomFromUrl();
    const timer = window.setTimeout(() => {
      if (
        roomId &&
        collaboratorName.trim() &&
        !activeRoomRef.current &&
        (!isPowerAppsRoomId(roomId) || powerAppsContext)
      ) {
        connect(roomId, null, false, collaboratorName);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collaboratorName, connect, powerAppsContext]);

  useEffect(() => () => disconnect(false), [disconnect]);

  useEffect(() => {
    if (
      !state.active ||
      !initialSyncCompleteRef.current ||
      !mapRef.current ||
      !docRef.current
    ) return;
    if (draftSyncKey(draft) === localBaselineRef.current) return;

    clearSaveRetry();
    if (sharedUpdateTimerRef.current) window.clearTimeout(sharedUpdateTimerRef.current);
    sharedUpdateTimerRef.current = window.setTimeout(() => {
      flushSharedDraftRef.current?.({
        persistHttp: socketRef.current?.readyState !== WebSocket.OPEN,
        sendSocket: true,
      });
    }, idleTimers().autosaveMs);
  }, [clearSaveRetry, draft, state.active]);

  useEffect(() => {
    function markOffline() {
      if (!activeRoomRef.current) return;
      updateStatus("offline");
    }
    function resumeAfterReconnect() {
      if (!activeRoomRef.current) return;
      const socket = socketRef.current;
      if (
        socket?.readyState === WebSocket.OPEN ||
        socket?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }
      idlePausedRef.current = false;
      suppressReconnectRef.current = false;
      resumeSocketRef.current?.();
    }
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", resumeAfterReconnect);
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", resumeAfterReconnect);
    };
  }, [updateStatus]);

  const pauseCollaborationForIdle = useCallback((keepalive = false) => {
    if (!activeRoomRef.current || idlePausedRef.current) return;
    idlePausedRef.current = true;
    suppressReconnectRef.current = true;
    clearTimers();
    flushSharedDraftRef.current?.({
      keepalive,
      persistHttp: true,
      sendSocket: true,
    });

    const socket = socketRef.current;
    const closeSocket = () => {
      if (socket && socketRef.current === socket) {
        socket.close();
        socketRef.current = null;
      }
    };
    const closeDelay = idleTimers().idleCloseDelayMs;
    if (closeDelay > 0 && !keepalive) {
      window.setTimeout(closeSocket, closeDelay);
    } else {
      closeSocket();
    }

    updateStatus("offline");
  }, [clearTimers, updateStatus]);

  const resumeCollaborationIfIdle = useCallback(() => {
    if (!activeRoomRef.current || document.hidden) return;
    const socket = socketRef.current;
    if (
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    idlePausedRef.current = false;
    suppressReconnectRef.current = false;
    resumeSocketRef.current?.();
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!activeRoomRef.current || document.hidden) return;
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      pauseCollaborationForIdle(false);
    }, idleTimers().idleMs);
  }, [pauseCollaborationForIdle]);

  const markUserActivity = useCallback(() => {
    if (!activeRoomRef.current || document.hidden) return;
    if (hiddenTimerRef.current) {
      window.clearTimeout(hiddenTimerRef.current);
      hiddenTimerRef.current = null;
    }
    resetIdleTimer();
    resumeCollaborationIfIdle();
  }, [resetIdleTimer, resumeCollaborationIfIdle]);

  useEffect(() => {
    if (!state.active) return;
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [resetIdleTimer, state.active, state.roomId]);

  useEffect(() => {
    if (!state.active) return;
    const activityEvents = [
      "click",
      "keydown",
      "mousemove",
      "scroll",
      "touchstart",
      "input",
      "change",
    ] as const;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markUserActivity, {
        capture: true,
        passive: true,
      });
    }

    return () => {
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markUserActivity, {
          capture: true,
        });
      }
    };
  }, [markUserActivity, state.active]);

  useEffect(() => {
    if (!state.active) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (hiddenTimerRef.current) window.clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = window.setTimeout(() => {
          pauseCollaborationForIdle(false);
        }, idleTimers().hiddenGraceMs);
        return;
      }

      if (hiddenTimerRef.current) {
        window.clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
      idlePausedRef.current = false;
      suppressReconnectRef.current = false;
      markUserActivity();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [markUserActivity, pauseCollaborationForIdle, state.active]);

  useEffect(() => {
    if (!state.active) return;

    const handlePageExit = () => {
      suppressReconnectRef.current = true;
      flushSharedDraftRef.current?.({
        keepalive: true,
        persistHttp: true,
        sendSocket: true,
      });
      socketRef.current?.close();
      socketRef.current = null;
    };

    window.addEventListener("pagehide", handlePageExit);
    window.addEventListener("beforeunload", handlePageExit);
    return () => {
      window.removeEventListener("pagehide", handlePageExit);
      window.removeEventListener("beforeunload", handlePageExit);
    };
  }, [state.active]);

  const start = useCallback((identityName = collaboratorName) => {
    if (!identityName.trim()) return "";
    const roomId = powerAppsContext
      ? powerAppsRoomId(randomRoomId())
      : randomRoomId();
    connect(roomId, draftRef.current, true, identityName);
    return roomId;
  }, [collaboratorName, connect, powerAppsContext]);

  const join = useCallback((roomId: string, identityName = collaboratorName) => {
    connect(roomId, null, true, identityName);
  }, [collaboratorName, connect]);

  const copyLink = useCallback(async () => {
    if (!state.roomId) return "";
    const link = collaborationLink(state.roomId);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.createElement("textarea");
      input.value = link;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    return link;
  }, [state.roomId]);

  const modeLabel = state.active
    ? powerAppsContext ? "Microsoft 365 Live" : "Live"
    : powerAppsContext ? "Microsoft 365 Draft" : "Personal Draft";
  const syncLabel = useMemo(() => {
    if (!state.active) return "Offline";
    if (state.status === "connected") return "Live";
    if (state.status === "syncing") return "Syncing";
    if (state.status === "saved") return "Saved";
    return "Offline";
  }, [state.active, state.status]);

  return {
    ...state,
    modeLabel,
    syncLabel,
    statusLabel: syncLabel,
    identityLabel: powerAppsContext
      ? `Microsoft: ${powerAppsContext.name}`
      : collaboratorName.trim() ? `Nama: ${collaboratorName.trim()}` : "",
    accessKind: powerAppsContext ? "powerapps" as const : "legacy" as const,
    shareLink: state.roomId ? collaborationLink(state.roomId) : "",
    start,
    join,
    leave: disconnect,
    copyLink,
  };
}
