import { create } from "zustand";
import type { MemoDraft, MemoMetadata } from "@/types/memo";
import {
  createInitialMemoDraft,
  normalizeMemoDraft,
} from "@/templates/bcaMemoTemplate";
import { generatePerihal } from "@/utils/generatePerihal";

const STORAGE_KEY = "memo-builder-fresh:blank-draft-v2";

type SaveStatus = "idle" | "loaded" | "saved" | "imported" | "error";

type MemoDraftStore = {
  draft: MemoDraft;
  history: MemoDraft[];
  hasLoaded: boolean;
  status: SaveStatus;
  lastSavedAt?: string;
  error?: string;
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft, recordHistory?: boolean) => void;
  updateMetadata: (patch: Partial<MemoMetadata>) => void;
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

export const useMemoDraftStore = create<MemoDraftStore>((set, get) => ({
  draft: createInitialMemoDraft(),
  history: [],
  hasLoaded: false,
  status: "idle",
  updateDraft: (updater, recordHistory = false) => {
    set((state) => ({
      draft: touch(updater(state.draft)),
      history: recordHistory
        ? [...state.history, state.draft].slice(-HISTORY_LIMIT)
        : state.history,
      status: "idle",
      error: undefined,
    }));
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
  replaceDraft: (draft, status = "idle") => {
    set({
      draft,
      history: [],
      status,
      error: undefined,
    });
  },
  loadFromLocal: () => {
    if (typeof window === "undefined") return;

    try {
      set({
        draft: createInitialMemoDraft(),
        history: [],
        hasLoaded: true,
        status: "idle",
        error: undefined,
      });
    } catch (error) {
      set({
        hasLoaded: true,
        status: "error",
        error: error instanceof Error ? error.message : "Gagal memuat draft lokal",
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
      status: "imported",
      error: undefined,
    });
  },
  resetDraft: () => {
    set({
      draft: createInitialMemoDraft(),
      history: [],
      status: "idle",
      error: undefined,
    });
  },
  undo: () => {
    set((state) => {
      const previous = state.history.at(-1);
      if (!previous) return state;

      return {
        ...state,
        draft: previous,
        history: state.history.slice(0, -1),
        status: "idle",
        error: undefined,
      };
    });
  },
}));
