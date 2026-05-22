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
  hasLoaded: boolean;
  status: SaveStatus;
  lastSavedAt?: string;
  error?: string;
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
  updateMetadata: (patch: Partial<MemoMetadata>) => void;
  loadFromLocal: () => void;
  saveToLocal: () => void;
  importDraft: (payload: unknown) => void;
  resetDraft: () => void;
};

function touch(draft: MemoDraft): MemoDraft {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
}

export const useMemoDraftStore = create<MemoDraftStore>((set, get) => ({
  draft: createInitialMemoDraft(),
  hasLoaded: false,
  status: "idle",
  updateDraft: (updater) => {
    set((state) => ({
      draft: touch(updater(state.draft)),
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
        status: "idle",
        error: undefined,
      };
    });
  },
  loadFromLocal: () => {
    if (typeof window === "undefined") return;

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      set({
        draft: raw ? normalizeMemoDraft(JSON.parse(raw)) : get().draft,
        hasLoaded: true,
        status: raw ? "loaded" : "idle",
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
      status: "imported",
      error: undefined,
    });
  },
  resetDraft: () => {
    set({
      draft: createInitialMemoDraft(),
      status: "idle",
      error: undefined,
    });
  },
}));
