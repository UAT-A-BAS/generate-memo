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
  updatedAt?: number;
  updatedBy?: string;
  saveId?: string;
};

const ROOM_PARAM = "room";
const WORKER_BASE_URL =
  process.env.NEXT_PUBLIC_COLLAB_WORKER_URL ??
  "https://generate-memo-collab.alex-marcello08.workers.dev";
const DOC_PREFIX = "generate-memo";
const LOCAL_ORIGIN = "memo-builder-local";
const REMOTE_ORIGIN = "memo-builder-remote";
const MAP_NAME = "form";
const DATA_KEY = "data";
const UPDATED_AT_KEY = "updatedAt";
const UPDATED_BY_KEY = "updatedBy";
const SNAPSHOT_PREFIX = "snapshot:";
const MAX_LOCAL_SNAPSHOTS = 20;
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

function jsonEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
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

function randomRoomId() {
  const bytes = new Uint8Array(8);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

function workerWebSocketUrl(roomId: string) {
  const url = new URL(`/collab/${encodeURIComponent(collaborationDocId(roomId))}`, WORKER_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function workerHttpUrl(roomId: string) {
  return new URL(`/collab/${encodeURIComponent(collaborationDocId(roomId))}`, WORKER_BASE_URL).toString();
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as PresenceMessage;
  } catch {
    return {};
  }
}

function snapshotKey(updatedAt: number, userId: string) {
  return `${SNAPSHOT_PREFIX}${updatedAt}:${encodeURIComponent(userId)}`;
}

function pruneSnapshotMap(map: Y.Map<unknown>) {
  const snapshotKeys: string[] = [];
  map.forEach((_, key) => {
    if (typeof key === "string" && key.startsWith(SNAPSHOT_PREFIX)) {
      snapshotKeys.push(key);
    }
  });
  snapshotKeys
    .sort((left, right) => {
      const leftTime = Number(left.slice(SNAPSHOT_PREFIX.length).split(":")[0] || 0);
      const rightTime = Number(right.slice(SNAPSHOT_PREFIX.length).split(":")[0] || 0);
      return rightTime - leftTime || right.localeCompare(left);
    })
    .slice(MAX_LOCAL_SNAPSHOTS)
    .forEach((key) => map.delete(key));
}

function draftSyncKey(draft: MemoDraft) {
  const syncDraft = {
    ...normalizeMemoDraft(draft),
    updatedAt: "",
  };
  return JSON.stringify(syncDraft);
}

async function persistDraftSnapshot(
  roomId: string,
  draft: MemoDraft,
  user: PresenceUser | null,
  updatedAt: number,
  keepalive = false,
): Promise<number | undefined> {
  if (typeof window === "undefined" || !roomId) return undefined;

  const payload = JSON.stringify({
    type: "draft-save",
    draft: normalizeMemoDraft(draft),
    updatedAt,
    user: user
      ? {
          id: user.id,
          name: user.name,
          color: user.color,
        }
      : null,
    initialSyncComplete: true,
  });
  const url = workerHttpUrl(roomId);

  if (keepalive && navigator.sendBeacon) {
    try {
      const queued = navigator.sendBeacon(
        url,
        new Blob([payload], { type: "application/json" }),
      );
      if (queued) return undefined;
    } catch {
      // Fall through to a keepalive fetch.
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive,
  });
  if (!response.ok) {
    throw new Error(`Snapshot HTTP ${response.status}`);
  }
  const result = await response.json() as { updatedAt?: unknown };
  const serverUpdatedAt = Number(result.updatedAt);
  return Number.isFinite(serverUpdatedAt) ? serverUpdatedAt : undefined;
}

function sharedDraftStateFromMap(map: Y.Map<unknown>) {
  let latestData = map.get(DATA_KEY);
  let latestUpdatedAt = Number(map.get(UPDATED_AT_KEY) || 0);

  map.forEach((value, key) => {
    if (typeof key !== "string" || !key.startsWith(SNAPSHOT_PREFIX)) return;
    if (!value || typeof value !== "object") return;

    const updatedAt = Number(key.slice(SNAPSHOT_PREFIX.length).split(":")[0] || "0");
    if (updatedAt >= latestUpdatedAt) {
      latestUpdatedAt = updatedAt;
      latestData = value;
    }
  });

  if (!latestData || typeof latestData !== "object") return null;
  return {
    draft: normalizeMemoDraft(latestData as Partial<MemoDraft>),
    updatedAt: latestUpdatedAt || Date.now(),
  };
}

export function collaborationLink(roomId: string) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set(ROOM_PARAM, roomId);
  return url.toString();
}

export function useMemoCollaboration(
  draft: MemoDraft,
  replaceDraft: (draft: MemoDraft, status?: "idle" | "loaded" | "saved" | "imported" | "error") => void,
  collaboratorName: string,
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
  const idleTimerRef = useRef<number | null>(null);
  const hiddenTimerRef = useRef<number | null>(null);
  const applyingRemoteRef = useRef(false);
  const localBaselineRef = useRef("");
  const localUpdatedAtRef = useRef(0);
  const pendingStateUpdateRef = useRef(false);
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
  const latestIdentityNameRef = useRef(collaboratorName);

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
      return;
    }
    if (activeRoomRef.current && initialSyncCompleteRef.current) {
      const nextSnapshot = draftSyncKey(draft);
      if (nextSnapshot !== localBaselineRef.current) {
        localUpdatedAtRef.current = Date.now();
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

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (sharedUpdateTimerRef.current) window.clearTimeout(sharedUpdateTimerRef.current);
    if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
    reconnectTimerRef.current = null;
    sharedUpdateTimerRef.current = null;
    syncAckTimerRef.current = null;
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
    localBaselineRef.current = "";
    localUpdatedAtRef.current = 0;
    pendingStateUpdateRef.current = false;
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
    const cleanRoom = roomId.trim();
    const cleanName = identityName.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleanRoom) || !cleanName) {
      setState((current) => ({
        ...current,
        status: "offline",
        lastError: "ID room tidak valid.",
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
    const user = saveCollaboratorIdentity(cleanName);
    let pendingSeed = seedDraft ? normalizeMemoDraft(draftRef.current) : null;
    let pendingSeedMustWin = Boolean(seedDraft);
    let firstConnection = true;

    docRef.current = doc;
    mapRef.current = map;
    userRef.current = user;
    activeRoomRef.current = cleanRoom;
    localBaselineRef.current = draftSyncKey(draftRef.current);
    localUpdatedAtRef.current = seedDraft ? Date.now() : 0;
    pendingStateUpdateRef.current = false;
    pendingSaveIdRef.current = "";
    initialSyncCompleteRef.current = false;
    expectedInitialDraftKeyRef.current = "";

    const sendPresence = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "presence", user }));
    };

    const applyPresence = (users: PresenceUser[]) => {
      setState((current) => ({
        ...current,
        collaborators: users.map((presence) => ({
          ...presence,
          isLocal: presence.id === user.id,
        })),
      }));
    };

    const flushPendingPresence = () => {
      if (!initialSyncCompleteRef.current || !pendingPresenceRef.current) return;
      const users = pendingPresenceRef.current;
      pendingPresenceRef.current = null;
      applyPresence(users);
    };

    const clearSyncAck = (saveId?: string) => {
      if (saveId && pendingSaveIdRef.current && saveId !== pendingSaveIdRef.current) return false;
      if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
      syncAckTimerRef.current = null;
      pendingSaveIdRef.current = "";
      pendingStateUpdateRef.current = false;
      return true;
    };

    const armSyncAckTimeout = (saveId: string) => {
      if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
      pendingSaveIdRef.current = saveId;
      syncAckTimerRef.current = window.setTimeout(() => {
        if (pendingSaveIdRef.current !== saveId) return;
        syncAckTimerRef.current = null;
        pendingSaveIdRef.current = "";
        pendingStateUpdateRef.current = true;
        updateStatus("offline");
        const socket = socketRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) socket.close();
      }, SYNC_ACK_TIMEOUT_MS);
    };

    const sendDraftSave = (normalized: MemoDraft, updatedAt: number) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !initialSyncCompleteRef.current) {
        pendingStateUpdateRef.current = true;
        updateStatus("offline");
        return false;
      }

      const saveId = `${user.id}:${updatedAt}:${++saveSequenceRef.current}`;
      try {
        socket.send(JSON.stringify({
          type: "draft-save",
          draft: normalized,
          updatedAt,
          user,
          saveId,
          initialSyncComplete: true,
        }));
      } catch {
        pendingStateUpdateRef.current = true;
        updateStatus("offline");
        socket.close();
        return false;
      }
      pendingStateUpdateRef.current = true;
      armSyncAckTimeout(saveId);
      updateStatus("syncing");
      return true;
    };

    const syncRemoteMap = (nextDraft: MemoDraft, updatedAt: number, updatedBy = "remote") => {
      if (!mapRef.current || !docRef.current) return;
      docRef.current.transact(() => {
        mapRef.current?.set(DATA_KEY, nextDraft);
        mapRef.current?.set(UPDATED_AT_KEY, updatedAt);
        mapRef.current?.set(UPDATED_BY_KEY, updatedBy);
        mapRef.current?.set(snapshotKey(updatedAt, updatedBy), nextDraft);
        pruneSnapshotMap(map);
      }, REMOTE_ORIGIN);
    };

    const applySharedDraft = (nextDraft: MemoDraft, updatedAt = Date.now(), updatedBy = "remote") => {
      applyingRemoteRef.current = true;
      try {
        if (jsonEqual(nextDraft, draftRef.current)) {
          localBaselineRef.current = draftSyncKey(nextDraft);
          localUpdatedAtRef.current = updatedAt;
          syncRemoteMap(nextDraft, updatedAt, updatedBy);
          return;
        }
        localBaselineRef.current = draftSyncKey(nextDraft);
        localUpdatedAtRef.current = updatedAt;
        replaceDraft(nextDraft, "loaded");
        syncRemoteMap(nextDraft, updatedAt, updatedBy);
      } finally {
        applyingRemoteRef.current = false;
      }
      setState((current) => ({
        ...current,
        lastSyncedAt: formatSyncTime(new Date(updatedAt)),
      }));
    };

    const applyRemoteDraftSnapshot = (nextDraft: MemoDraft, updatedAt: number, updatedBy = "remote") => {
      if (!initialSyncCompleteRef.current) return;
      const localIsDirty = draftSyncKey(draftRef.current) !== localBaselineRef.current;
      if ((localIsDirty || pendingStateUpdateRef.current) && localUpdatedAtRef.current > updatedAt) {
        return;
      }
      applySharedDraft(nextDraft, updatedAt, updatedBy);
      if (updatedAt >= localUpdatedAtRef.current) {
        pendingStateUpdateRef.current = false;
        clearSyncAck();
      }
    };

    const commitSharedDraft = (nextDraft = draftRef.current, updatedAt = Date.now()) => {
      if (!mapRef.current || !docRef.current || applyingRemoteRef.current) return;
      const normalized = normalizeMemoDraft(nextDraft);
      localBaselineRef.current = draftSyncKey(normalized);
      localUpdatedAtRef.current = updatedAt;
      pendingStateUpdateRef.current = true;
      docRef.current.transact(() => {
        mapRef.current?.set(DATA_KEY, normalized);
        mapRef.current?.set(UPDATED_AT_KEY, updatedAt);
        mapRef.current?.set(UPDATED_BY_KEY, user.id);
        mapRef.current?.set(snapshotKey(updatedAt, user.id), normalized);
        pruneSnapshotMap(map);
      }, LOCAL_ORIGIN);

      sendDraftSave(normalized, updatedAt);
    };

    flushSharedDraftRef.current = (options: FlushOptions = {}) => {
      if (
        applyingRemoteRef.current ||
        !activeRoomRef.current ||
        !initialSyncCompleteRef.current
      ) return;
      const normalized = normalizeMemoDraft(draftRef.current);
      const updatedAt = Date.now();
      localBaselineRef.current = draftSyncKey(normalized);
      localUpdatedAtRef.current = updatedAt;
      pendingStateUpdateRef.current = true;

      if (mapRef.current && docRef.current) {
        docRef.current.transact(() => {
          mapRef.current?.set(DATA_KEY, normalized);
          mapRef.current?.set(UPDATED_AT_KEY, updatedAt);
          mapRef.current?.set(UPDATED_BY_KEY, user.id);
          mapRef.current?.set(snapshotKey(updatedAt, user.id), normalized);
          pruneSnapshotMap(map);
        }, LOCAL_ORIGIN);

        if (options.sendSocket !== false) sendDraftSave(normalized, updatedAt);
      }

      if (options.persistHttp) {
        void persistDraftSnapshot(
          activeRoomRef.current,
          normalized,
          user,
          updatedAt,
          options.keepalive,
        ).then((serverUpdatedAt) => {
          if (
            serverUpdatedAt !== undefined &&
            localUpdatedAtRef.current === updatedAt
          ) {
            localUpdatedAtRef.current = serverUpdatedAt;
          }
        }).catch(() => {
          pendingStateUpdateRef.current = true;
          updateStatus(
            "offline",
            undefined,
            "Draft belum tersimpan ke server. Koneksi akan dicoba kembali.",
          );
        });
      }
    };

    const connectSocket = () => {
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
          if (message.type === "saved") {
            const saveId = typeof message.saveId === "string"
              ? message.saveId
              : "";
            const ackMatchesPending = saveId
              ? saveId === pendingSaveIdRef.current
              : true;
            if (ackMatchesPending) {
              const serverUpdatedAt = Number(message.updatedAt);
              if (Number.isFinite(serverUpdatedAt)) {
                localUpdatedAtRef.current = serverUpdatedAt;
              }
              if (clearSyncAck(saveId || undefined)) {
                updateStatus("saved", formatSyncTime());
              }
            }
          }
          if (message.type === "save-error") {
            clearSyncAck(
              typeof message.saveId === "string" ? message.saveId : undefined,
            );
            pendingStateUpdateRef.current = true;
            updateStatus(
              "offline",
              undefined,
              "Draft ditolak server karena format atau ukurannya tidak valid.",
            );
          }
          if (message.type === "presence") {
            const users = message.users ?? [];
            if (!initialSyncCompleteRef.current) pendingPresenceRef.current = users;
            else applyPresence(users);
          }
          if (message.type === "draft-update" && message.draft) {
            applyRemoteDraftSnapshot(
              normalizeMemoDraft(message.draft),
              Number(message.updatedAt || Date.now()),
              message.updatedBy || "remote",
            );
          }
          if (message.type === "room-snapshot" && message.draft) {
            const normalized = normalizeMemoDraft(message.draft);
            const canHydrateFromSnapshot = !pendingSeed &&
              !pendingStateUpdateRef.current &&
              draftSyncKey(draftRef.current) === localBaselineRef.current;
            if (canHydrateFromSnapshot) {
              applySharedDraft(
                normalized,
                Number(message.updatedAt || Date.now()),
                message.updatedBy || "remote",
              );
              initialSyncCompleteRef.current = true;
              expectedInitialDraftKeyRef.current = "";
              socket.send(JSON.stringify({ type: "sync-ready" }));
              flushPendingPresence();
            } else {
              expectedInitialDraftKeyRef.current = draftSyncKey(normalized);
            }
          }
          return;
        }

        const buffer = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
        Y.applyUpdate(docRef.current, new Uint8Array(buffer), REMOTE_ORIGIN);

        if (!firstServerSync) {
          firstServerSync = true;
          const remoteState = sharedDraftStateFromMap(map);
          const hasRemoteDraft = Boolean(remoteState);
          const remoteUpdatedAt = remoteState?.updatedAt ?? 0;
          const localIsDirty = draftSyncKey(draftRef.current) !== localBaselineRef.current;
          const localShouldWin = Boolean(
            (pendingSeed && (!hasRemoteDraft || pendingSeedMustWin)) ||
            (!pendingSeed && !firstConnection && (localIsDirty || pendingStateUpdateRef.current) && localUpdatedAtRef.current >= remoteUpdatedAt),
          );

          if (localShouldWin) {
            initialSyncCompleteRef.current = true;
            socket.send(JSON.stringify({ type: "sync-ready" }));
            commitSharedDraft(
              pendingSeed ?? draftRef.current,
              pendingSeed ? localUpdatedAtRef.current || Date.now() : localUpdatedAtRef.current || Date.now(),
            );
          } else if (remoteState) {
            expectedInitialDraftKeyRef.current = draftSyncKey(remoteState.draft);
            applySharedDraft(
              remoteState.draft,
              remoteUpdatedAt || Date.now(),
              String(map.get(UPDATED_BY_KEY) || "remote"),
            );
            initialSyncCompleteRef.current = true;
            expectedInitialDraftKeyRef.current = "";
            socket.send(JSON.stringify({ type: "sync-ready" }));
          } else {
            initialSyncCompleteRef.current = true;
            socket.send(JSON.stringify({ type: "sync-ready" }));
          }
          pendingSeed = null;
          pendingSeedMustWin = false;
          firstConnection = false;
          flushPendingPresence();
        }
      });

      socket.addEventListener("close", () => {
        if (socket !== socketRef.current) return;
        socketRef.current = null;
        const hadPendingSave = Boolean(pendingSaveIdRef.current);
        if (syncAckTimerRef.current) window.clearTimeout(syncAckTimerRef.current);
        syncAckTimerRef.current = null;
        pendingSaveIdRef.current = "";
        initialSyncCompleteRef.current = false;
        if (hadPendingSave || draftSyncKey(draftRef.current) !== localBaselineRef.current) {
          pendingStateUpdateRef.current = true;
        }
        updateStatus("offline");
        if (
          suppressReconnectRef.current ||
          idlePausedRef.current ||
          document.hidden ||
          !navigator.onLine
        ) {
          return;
        }
        const timers = idleTimers();
        const delay = Math.min(
          timers.reconnectBaseMs * (2 ** reconnectAttemptRef.current),
          timers.reconnectMaxMs,
        );
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connectSocket, delay);
      });

      socket.addEventListener("error", () => {
        if (socket !== socketRef.current) return;
        updateStatus("offline");
      });
    };

    resumeSocketRef.current = connectSocket;
    setState({
      active: true,
      roomId: cleanRoom,
      status: "syncing",
      collaborators: [{ ...user, isLocal: true }],
    });
    connectSocket();
  }, [disconnect, replaceDraft, clearTimers, updateStatus]);

  useEffect(() => {
    const roomId = roomFromUrl();
    const timer = window.setTimeout(() => {
      if (roomId && collaboratorName.trim() && !activeRoomRef.current) {
        connect(roomId, null, false, collaboratorName);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collaboratorName, connect]);

  useEffect(() => () => disconnect(false), [disconnect]);

  useEffect(() => {
    if (
      !state.active ||
      !initialSyncCompleteRef.current ||
      !mapRef.current ||
      !docRef.current
    ) return;
    const nextSnapshot = draftSyncKey(draft);
    if (nextSnapshot === localBaselineRef.current) return;

    if (sharedUpdateTimerRef.current) window.clearTimeout(sharedUpdateTimerRef.current);
    sharedUpdateTimerRef.current = window.setTimeout(() => {
      flushSharedDraftRef.current?.({
        persistHttp: socketRef.current?.readyState !== WebSocket.OPEN,
        sendSocket: true,
      });
    }, idleTimers().autosaveMs);
  }, [draft, state.active, updateStatus]);

  useEffect(() => {
    function updateOnlineStatus() {
      if (!activeRoomRef.current) {
        updateStatus("offline");
        return;
      }
      updateStatus(navigator.onLine ? state.status : "offline");
    }
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [state.status, updateStatus]);

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
    if (idlePausedRef.current || !socketRef.current) {
      resumeCollaborationIfIdle();
    }
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
    const roomId = randomRoomId();
    connect(roomId, draftRef.current, true, identityName);
    return roomId;
  }, [collaboratorName, connect]);

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

  const modeLabel = state.active ? "Live" : "Personal Draft";
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
    shareLink: state.roomId ? collaborationLink(state.roomId) : "",
    start,
    join,
    leave: disconnect,
    copyLink,
  };
}
