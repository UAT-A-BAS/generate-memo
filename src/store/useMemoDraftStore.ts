import { create } from "zustand";
import type { MemoDraft, MemoMetadata } from "@/types/memo";
import {
  createInitialMemoDraft,
  normalizeMemoDraft,
} from "@/templates/bcaMemoTemplate";
import { generatePerihal } from "@/utils/generatePerihal";

const STORAGE_KEY = "memo-builder-fresh:blank-draft-v2";

type SaveStatus = "idle" | "loaded" | "saved" | "imported" | "error";

type EditCheckpoint = {
  key: string;
  draft: MemoDraft;
};

type MemoDraftStore = {
  draft: MemoDraft;
  history: MemoDraft[];
  editCheckpoint?: EditCheckpoint;
  hasLoaded: boolean;
  status: SaveStatus;
  lastSavedAt?: string;
  error?: string;
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft, recordHistory?: boolean) => void;
  updateMetadata: (patch: Partial<MemoMetadata>) => void;
  beginEditSession: (key: string) => void;
  commitEditSession: (key?: string) => void;
  hasActiveEditChanges: () => boolean;
  replaceDraft: (draft: MemoDraft, status?: SaveStatus) => void;
  loadFromLocal: () => void;
  saveToLocal: () => void;
  importDraft: (payload: unknown) => void;
  resetDraft: () => void;
  undo: () => void;
};

const HISTORY_LIMIT = 100;

function touch(draft: MemoDraft): MemoDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
}

function comparableDraft(draft: MemoDraft) {
  return JSON.stringify({ ...draft, updatedAt: "" });
}

function draftsMatch(first: MemoDraft, second: MemoDraft) {
  return comparableDraft(first) === comparableDraft(second);
}

function appendHistory(history: MemoDraft[], snapshot: MemoDraft, current: MemoDraft) {
  if (draftsMatch(snapshot, current)) return history;
  if (history.at(-1) && draftsMatch(history.at(-1) as MemoDraft, snapshot)) {
    return history;
  }
  return [...history, snapshot].slice(-HISTORY_LIMIT);
}

export const useMemoDraftStore = create<MemoDraftStore>((set, get) => ({
  draft: createInitialMemoDraft(),
  history: [],
  editCheckpoint: undefined,
  hasLoaded: false,
  status: "idle",
  updateDraft: (updater, recordHistory = false) => {
    set((state) => {
      const nextDraft = updater(state.draft);
      let history = state.history;
      if (recordHistory && state.editCheckpoint) {
        history = appendHistory(history, state.editCheckpoint.draft, state.draft);
      }
      if (recordHistory) {
        history = appendHistory(history, state.draft, nextDraft);
      }

      return {
        draft: touch(nextDraft),
        history,
        editCheckpoint: recordHistory ? undefined : state.editCheckpoint,
        status: "idle",
        error: undefined,
      };
    });
  },
  updateMetadata: (patch) => {
    set((state) => {
      const metadata = {
        ...state.draft.metadata,
        ...patch,
      };

      const nextMetadata = {
        ...metadata,
        perihal: metadata.autoPerihal ? generatePerihal(metadata) : metadata.perihal,
      };

      return {
        draft: touch({
          ...state.draft,
          metadata: nextMetadata,
        }),
        history: state.history,
        status: "idle",
        error: undefined,
      };
    });
  },
  beginEditSession: (key) => {
    set((state) => {
      if (state.editCheckpoint?.key === key) return state;

      const history = state.editCheckpoint
        ? appendHistory(state.history, state.editCheckpoint.draft, state.draft)
        : state.history;

      return {
        ...state,
        history,
        editCheckpoint: { key, draft: state.draft },
      };
    });
  },
  commitEditSession: (key) => {
    set((state) => {
      if (!state.editCheckpoint || (key && state.editCheckpoint.key !== key)) {
        return state;
      }

      const history = appendHistory(
        state.history,
        state.editCheckpoint.draft,
        state.draft,
      );
      return {
        ...state,
        history,
        editCheckpoint: undefined,
      };
    });
  },
  hasActiveEditChanges: () => {
    const state = get();
    return Boolean(
      state.editCheckpoint &&
        !draftsMatch(state.editCheckpoint.draft, state.draft),
    );
  },
  replaceDraft: (draft, status = "idle") => {
    set({
      draft,
      history: [],
      editCheckpoint: undefined,
      status,
      error: undefined,
    });
  },
  loadFromLocal: () => {
    if (typeof window === "undefined") return;

    try {
      const storedDraft = window.localStorage.getItem(STORAGE_KEY);
      let draft = createInitialMemoDraft();
      let status: SaveStatus = "idle";
      if (storedDraft) {
        const parsed = JSON.parse(storedDraft) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Draft lokal tidak valid dan telah direset.");
        }
        draft = normalizeMemoDraft(parsed as Partial<MemoDraft>);
        status = "loaded";
      }
      set({
        draft,
        history: [],
        editCheckpoint: undefined,
        hasLoaded: true,
        status,
        error: undefined,
      });
    } catch (error) {
      set({
        draft: createInitialMemoDraft(),
        history: [],
        editCheckpoint: undefined,
        hasLoaded: true,
        status: "error",
        error: error instanceof Error
          ? `Gagal memuat draft lokal: ${error.message}`
          : "Gagal memuat draft lokal",
      });
    }
  },
  saveToLocal: () => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(get().draft));
      set({
        status: "saved",
        lastSavedAt: new Date().toISOString(),
        error: undefined,
      });
    } catch (error) {
      set({
        status: "error",
        error: error instanceof Error ? error.message : "Gagal menyimpan draft",
      });
    }
  },
  importDraft: (payload) => {
    set({
      draft: normalizeMemoDraft(payload as Partial<MemoDraft>),
      history: [],
      editCheckpoint: undefined,
      status: "imported",
      error: undefined,
    });
  },
  resetDraft: () => {
    set({
      draft: createInitialMemoDraft(),
      history: [],
      editCheckpoint: undefined,
      status: "idle",
      error: undefined,
    });
  },
  undo: () => {
    set((state) => {
      const history = state.editCheckpoint
        ? appendHistory(state.history, state.editCheckpoint.draft, state.draft)
        : state.history;
      const previous = history.at(-1);
      if (!previous) return state;

      return {
        ...state,
        draft: previous,
        history: history.slice(0, -1),
        editCheckpoint: undefined,
        status: "idle",
        error: undefined,
      };
    });
  },
}));
