"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import type { MemoDraft } from "@/types/memo";
import { normalizeMemoDraft } from "@/templates/bcaMemoTemplate";

type ConnectionStatus = "offline" | "reconnecting" | "connected";

type Collaborator = {
  id: number;
  name: string;
  color: string;
  isLocal: boolean;
};

type AwarenessUser = {
  name?: string;
  color?: string;
};

type CollaborationState = {
  active: boolean;
  roomId: string;
  status: ConnectionStatus;
  collaborators: Collaborator[];
  lastSyncedAt?: string;
};

type MemoKey = keyof MemoDraft;

const ROOM_PARAM = "room";
const LOCAL_ORIGIN = "memo-builder-local";
const STORAGE_PREFIX = "memo-builder-fresh:collab-room:";
const CHANNEL_PREFIX = "memo-builder-fresh:collab:";
const SIGNALING_SERVERS = [
  "wss://signaling.yjs.dev",
  "wss://y-webrtc-signaling-eu.herokuapp.com",
  "wss://y-webrtc-signaling-us.herokuapp.com",
];
const MEMO_KEYS: MemoKey[] = [
  "id",
  "version",
  "metadata",
  "recipients",
  "introduction",
  "referenceEnabled",
  "reference",
  "developmentRows",
  "pilotSchedule",
  "activities",
  "contacts",
  "signers",
  "ccRecipients",
  "initials",
  "initialsBureau",
  "appendixScenarios",
  "updatedAt",
];

function jsonEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function roomFromUrl() {
  if (typeof window === "undefined") return "";
  return new URL(window.location.href).searchParams.get(ROOM_PARAM) ?? "";
}

function setRoomUrl(roomId: string) {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set(ROOM_PARAM, roomId);
  } else {
    url.searchParams.delete(ROOM_PARAM);
  }
  window.history.replaceState({}, "", url.toString());
}

function randomRoomId() {
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function roomStorageKey(roomId: string) {
  return `${STORAGE_PREFIX}${roomId}`;
}

function readStoredRoomDraft(roomId: string) {
  try {
    const stored = window.localStorage.getItem(roomStorageKey(roomId));
    return stored ? normalizeMemoDraft(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function writeStoredRoomDraft(roomId: string, draft: MemoDraft) {
  try {
    window.localStorage.setItem(roomStorageKey(roomId), JSON.stringify(draft));
  } catch {
    return;
  }
}

function userProfile() {
  const stored = window.localStorage.getItem("memo-builder:user-profile");
  if (stored) return JSON.parse(stored) as { name: string; color: string };

  const suffix = Math.floor(100 + Math.random() * 900);
  const profile = {
    name: `Anon ${suffix}`,
    color: ["#0A67B1", "#18735C", "#7C3AED", "#B45309", "#BE123C"][suffix % 5],
  };
  window.localStorage.setItem("memo-builder:user-profile", JSON.stringify(profile));
  return profile;
}

function mapHasMemoData(map: Y.Map<unknown>) {
  return MEMO_KEYS.some((key) => map.has(key));
}

function draftToMap(draft: MemoDraft, map: Y.Map<unknown>) {
  for (const key of MEMO_KEYS) {
    const value = draft[key];
    if (!jsonEqual(map.get(key), value)) {
      map.set(key, value);
    }
  }
}

function mapToDraft(map: Y.Map<unknown>, fallback: MemoDraft) {
  const payload = MEMO_KEYS.reduce<Record<string, unknown>>((result, key) => {
    if (map.has(key)) result[key] = map.get(key);
    return result;
  }, {});
  return normalizeMemoDraft({ ...fallback, ...payload });
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
  const providerRef = useRef<WebrtcProvider | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const applyingRemoteRef = useRef(false);
  const localBaselineRef = useRef("");
  const activeRoomRef = useRef("");
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const disconnect = useCallback((clearUrl = true) => {
    channelRef.current?.close();
    providerRef.current?.destroy();
    docRef.current?.destroy();
    channelRef.current = null;
    providerRef.current = null;
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
  }, []);

  const connect = useCallback((roomId: string, seedDraft: MemoDraft | null, updateUrl = true) => {
    const cleanRoom = roomId.trim();
    if (!cleanRoom) return;

    disconnect(false);
    if (updateUrl) setRoomUrl(cleanRoom);

    const doc = new Y.Doc();
    const map = doc.getMap("memo");
    const provider = new WebrtcProvider(`generate-memo:${cleanRoom}`, doc, {
      signaling: SIGNALING_SERVERS,
    });
    const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${cleanRoom}`);
    const profile = userProfile();
    const storedDraft = readStoredRoomDraft(cleanRoom);

    docRef.current = doc;
    mapRef.current = map;
    providerRef.current = provider;
    channelRef.current = channel;
    activeRoomRef.current = cleanRoom;
    localBaselineRef.current = JSON.stringify(storedDraft ?? seedDraft ?? draftRef.current);

    provider.awareness.setLocalStateField("user", profile);

    const syncCollaborators = () => {
      const users: Collaborator[] = [];
      provider.awareness.getStates().forEach((awarenessState, clientId) => {
        const user = (awarenessState as { user?: AwarenessUser }).user;
        users.push({
          id: clientId,
          name: user?.name ?? `Anon ${clientId}`,
          color: user?.color ?? "#64748B",
          isLocal: clientId === doc.clientID,
        });
      });
      setState((current) => ({ ...current, collaborators: users }));
    };

    provider.on("status", ({ connected }: { connected: boolean }) => {
      setState((current) => ({
        ...current,
        status: connected ? "connected" : navigator.onLine ? "reconnecting" : "offline",
      }));
    });
    provider.on("synced", () => {
      setState((current) => ({
        ...current,
        status: provider.connected ? "connected" : current.status,
        lastSyncedAt: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }));
    });
    provider.awareness.on("change", syncCollaborators);
    syncCollaborators();

    const applyRemoteDraft = (nextDraft: MemoDraft) => {
      applyingRemoteRef.current = true;
      localBaselineRef.current = JSON.stringify(nextDraft);
      replaceDraft(nextDraft, "loaded");
      applyingRemoteRef.current = false;
      writeStoredRoomDraft(cleanRoom, nextDraft);
      setState((current) => ({
        ...current,
        lastSyncedAt: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }));
    };

    channel.onmessage = (event) => {
      const payload = (event.data as { type?: string; draft?: MemoDraft }) ?? {};
      if (payload.type !== "draft" || !payload.draft) return;
      const nextDraft = normalizeMemoDraft(payload.draft);
      if (jsonEqual(nextDraft, draftRef.current)) return;
      applyRemoteDraft(nextDraft);
    };

    map.observe((event, transaction) => {
      if (transaction.origin === LOCAL_ORIGIN) return;
      const nextDraft = mapToDraft(map, draftRef.current);
      applyRemoteDraft(nextDraft);
      if (event.keysChanged.size > 0) {
        setState((current) => ({
          ...current,
          lastSyncedAt: new Date().toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }));
      }
    });

    if (seedDraft && !mapHasMemoData(map)) {
      doc.transact(() => draftToMap(seedDraft, map), LOCAL_ORIGIN);
      writeStoredRoomDraft(cleanRoom, seedDraft);
      channel.postMessage({ type: "draft", draft: seedDraft });
    } else if (storedDraft) {
      applyRemoteDraft(storedDraft);
    }

    setState((current) => ({
      ...current,
      active: true,
      roomId: cleanRoom,
      status: provider.connected ? "connected" : "reconnecting",
    }));
  }, [disconnect, replaceDraft]);

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
    docRef.current.transact(() => draftToMap(draft, mapRef.current as Y.Map<unknown>), LOCAL_ORIGIN);
    localBaselineRef.current = nextSnapshot;
    writeStoredRoomDraft(state.roomId, draft);
    channelRef.current?.postMessage({ type: "draft", draft });
    setState((current) => ({
      ...current,
      lastSyncedAt: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    }));
  }, [draft, state.active, state.roomId]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (!activeRoomRef.current || event.key !== roomStorageKey(activeRoomRef.current) || !event.newValue) {
        return;
      }
      try {
        const nextDraft = normalizeMemoDraft(JSON.parse(event.newValue));
        if (jsonEqual(nextDraft, draftRef.current)) return;
        applyingRemoteRef.current = true;
        localBaselineRef.current = JSON.stringify(nextDraft);
        replaceDraft(nextDraft, "loaded");
        applyingRemoteRef.current = false;
      } catch {
        return;
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [replaceDraft]);

  useEffect(() => {
    function updateOnlineStatus() {
      setState((current) => ({
        ...current,
        status: current.active
          ? navigator.onLine
            ? providerRef.current?.connected
              ? "connected"
              : "reconnecting"
            : "offline"
          : "offline",
      }));
    }
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

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
    await navigator.clipboard.writeText(link);
    return link;
  }, [state.roomId]);

  const statusLabel = useMemo(() => {
    if (!state.active) return "Draft lokal";
    if (state.status === "connected") return "Live";
    if (state.status === "reconnecting") return "Menyambungkan";
    return "Offline";
  }, [state.active, state.status]);

  return {
    ...state,
    statusLabel,
    shareLink: state.roomId ? collaborationLink(state.roomId) : "",
    start,
    join,
    leave: disconnect,
    copyLink,
  };
}
