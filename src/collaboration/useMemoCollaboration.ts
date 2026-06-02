"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import type { MemoDraft } from "@/types/memo";
import { normalizeMemoDraft } from "@/templates/bcaMemoTemplate";

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
};

type PresenceUser = {
  id: string;
  name: string;
  color: string;
};

type PresenceMessage = {
  type?: string;
  users?: PresenceUser[];
};

const ROOM_PARAM = "room";
const WORKER_BASE_URL = "https://generate-berita-acara-collab.alex-marcello08.workers.dev";
const DOC_PREFIX = "generate-memo";
const LOCAL_ORIGIN = "memo-builder-local";
const REMOTE_ORIGIN = "memo-builder-remote";
const MAP_NAME = "form";
const DATA_KEY = "data";
const UPDATED_AT_KEY = "updatedAt";
const UPDATED_BY_KEY = "updatedBy";

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

function userProfile() {
  const stored = window.localStorage.getItem("memo-builder:user-profile");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<PresenceUser>;
      if (parsed.id && parsed.name && parsed.color) return parsed as PresenceUser;
    } catch {
      window.localStorage.removeItem("memo-builder:user-profile");
    }
  }

  const suffix = Math.floor(100 + Math.random() * 900);
  const profile = {
    id: `memo-user-${randomRoomId()}`,
    name: `Reviewer ${suffix}`,
    color: ["#0A67B1", "#18735C", "#7C3AED", "#B45309", "#BE123C"][suffix % 5],
  };
  window.localStorage.setItem("memo-builder:user-profile", JSON.stringify(profile));
  return profile;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as PresenceMessage;
  } catch {
    return {};
  }
}

function sharedDraftFromMap(map: Y.Map<unknown>) {
  const data = map.get(DATA_KEY);
  if (!data || typeof data !== "object") return null;
  return normalizeMemoDraft(data as Partial<MemoDraft>);
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
  const applyingRemoteRef = useRef(false);
  const localBaselineRef = useRef("");
  const activeRoomRef = useRef("");
  const userRef = useRef<PresenceUser | null>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const updateStatus = useCallback((status: ConnectionStatus, lastSyncedAt?: string) => {
    setState((current) => ({
      ...current,
      status,
      lastSyncedAt: lastSyncedAt ?? current.lastSyncedAt,
    }));
  }, []);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    if (sharedUpdateTimerRef.current) window.clearTimeout(sharedUpdateTimerRef.current);
    reconnectTimerRef.current = null;
    sharedUpdateTimerRef.current = null;
  }, []);

  const disconnect = useCallback((clearUrl = true) => {
    clearTimers();
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
    if (clearUrl) setRoomUrl("");
    setState({
      active: false,
      roomId: "",
      status: "offline",
      collaborators: [],
    });
  }, [clearTimers]);

  const connect = useCallback((roomId: string, seedDraft: MemoDraft | null, updateUrl = true) => {
    const cleanRoom = roomId.trim();
    if (!cleanRoom) return;

    disconnect(false);
    if (updateUrl) setRoomUrl(cleanRoom);

    const doc = new Y.Doc();
    const map = doc.getMap(MAP_NAME);
    const user = userProfile();
    let firstServerSync = false;
    let pendingSeed = seedDraft ? normalizeMemoDraft(seedDraft) : null;
    let pendingSeedMustWin = Boolean(seedDraft);

    docRef.current = doc;
    mapRef.current = map;
    userRef.current = user;
    activeRoomRef.current = cleanRoom;
    localBaselineRef.current = JSON.stringify(seedDraft ?? draftRef.current);

    const sendPresence = () => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "presence", user }));
    };

    const sendYUpdate = (update: Uint8Array) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        updateStatus("offline");
        return;
      }
      socket.send(update);
      updateStatus("syncing");
    };

    const applySharedDraft = (nextDraft: MemoDraft) => {
      if (jsonEqual(nextDraft, draftRef.current)) {
        localBaselineRef.current = JSON.stringify(nextDraft);
        return;
      }
      applyingRemoteRef.current = true;
      localBaselineRef.current = JSON.stringify(nextDraft);
      replaceDraft(nextDraft, "loaded");
      applyingRemoteRef.current = false;
      const updatedAt = Number(map.get(UPDATED_AT_KEY) || Date.now());
      setState((current) => ({
        ...current,
        lastSyncedAt: formatSyncTime(new Date(updatedAt)),
      }));
    };

    const commitSharedDraft = (nextDraft = draftRef.current) => {
      if (!mapRef.current || !docRef.current || applyingRemoteRef.current) return;
      const normalized = normalizeMemoDraft(nextDraft);
      const updatedAt = Date.now();
      localBaselineRef.current = JSON.stringify(normalized);
      docRef.current.transact(() => {
        mapRef.current?.set(DATA_KEY, normalized);
        mapRef.current?.set(UPDATED_AT_KEY, updatedAt);
        mapRef.current?.set(UPDATED_BY_KEY, user.id);
      }, LOCAL_ORIGIN);
    };

    const applySharedDraftIfPresent = () => {
      const remoteDraft = sharedDraftFromMap(map);
      if (!remoteDraft) return false;
      applySharedDraft(remoteDraft);
      return true;
    };

    doc.on("update", (update, origin) => {
      if (origin === REMOTE_ORIGIN) return;
      sendYUpdate(update);
    });

    map.observe((_, transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      applySharedDraftIfPresent();
    });

    const connectSocket = () => {
      clearTimers();
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
        updateStatus("connected");
        sendPresence();
      });

      socket.addEventListener("message", async (event) => {
        if (socket !== socketRef.current || !docRef.current) return;
        if (typeof event.data === "string") {
          const message = safeJsonParse(event.data);
          if (message.type === "saved") {
            updateStatus("saved", formatSyncTime());
          }
          if (message.type === "presence") {
            const users = message.users ?? [];
            setState((current) => ({
              ...current,
              collaborators: users.map((presence) => ({
                ...presence,
                isLocal: presence.id === user.id,
              })),
            }));
          }
          return;
        }

        const buffer = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
        Y.applyUpdate(docRef.current, new Uint8Array(buffer), REMOTE_ORIGIN);

        if (!firstServerSync) {
          firstServerSync = true;
          const hasRemoteDraft = Boolean(sharedDraftFromMap(map));
          if (pendingSeed && (!hasRemoteDraft || pendingSeedMustWin)) {
            commitSharedDraft(pendingSeed);
          } else if (!applySharedDraftIfPresent() && pendingSeed) {
            commitSharedDraft(pendingSeed);
          } else if (hasRemoteDraft) {
            applySharedDraftIfPresent();
          }
          pendingSeed = null;
          pendingSeedMustWin = false;
          sendYUpdate(Y.encodeStateAsUpdate(doc));
        }
      });

      socket.addEventListener("close", () => {
        if (socket !== socketRef.current) return;
        updateStatus("offline");
        reconnectTimerRef.current = window.setTimeout(connectSocket, 1800);
      });

      socket.addEventListener("error", () => {
        if (socket !== socketRef.current) return;
        updateStatus("offline");
      });
    };

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
      if (roomId) connect(roomId, null, false);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      disconnect(false);
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (!state.active || applyingRemoteRef.current || !mapRef.current || !docRef.current) return;
    const nextSnapshot = JSON.stringify(draft);
    if (nextSnapshot === localBaselineRef.current) return;

    if (sharedUpdateTimerRef.current) window.clearTimeout(sharedUpdateTimerRef.current);
    sharedUpdateTimerRef.current = window.setTimeout(() => {
      if (!mapRef.current || !docRef.current || applyingRemoteRef.current) return;
      const normalized = normalizeMemoDraft(draftRef.current);
      const updatedAt = Date.now();
      localBaselineRef.current = JSON.stringify(normalized);
      docRef.current.transact(() => {
        mapRef.current?.set(DATA_KEY, normalized);
        mapRef.current?.set(UPDATED_AT_KEY, updatedAt);
        mapRef.current?.set(UPDATED_BY_KEY, userRef.current?.id ?? "");
      }, LOCAL_ORIGIN);
    }, 180);
  }, [draft, state.active]);

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

  const start = useCallback(() => {
    const roomId = randomRoomId();
    connect(roomId, draft, true);
    return roomId;
  }, [connect, draft]);

  const join = useCallback((roomId: string) => {
    connect(roomId, null, true);
  }, [connect]);

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
