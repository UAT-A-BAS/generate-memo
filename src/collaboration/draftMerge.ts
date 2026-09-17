/**
 * Typed browser-side facade for the collaboration merge engine.
 *
 * The Cloudflare Worker and the client must resolve conflicts identically, so
 * both use the same implementation. The engine itself is a plain `.mjs` module
 * shared with the Worker, so this file supplies the types the client needs.
 */
import * as engine from "../../workers/collab/draftMerge.mjs";
import type { MemoDraft } from "@/types/memo";

export type Stamp =
  | number
  | {
      value?: number;
      fields?: Record<string, number>;
      rows?: Record<string, number>;
    };

export type StampTable = Record<string, Stamp>;

export type MergeResult = {
  /** Merged draft, or `null` when there is nothing to merge into. */
  draft: MemoDraft | null;
  timestamps: StampTable;
  mergedAt: number;
  mergedKeys: string[];
};

export type MergeInput = {
  base: unknown;
  current: unknown;
  incoming: unknown;
  timestamps?: StampTable | null;
  incomingTimestamps?: StampTable | null;
  incomingAt?: number;
};

export type MergeEngine = {
  MERGE_KEYS: string[];
  ID_ROW_KEYS: string[];
  SHALLOW_OBJECT_KEYS: string[];
  jsonEqual(left: unknown, right: unknown): boolean;
  normalizeStamp(value: unknown): number;
  mergeStamps(left: unknown, right: unknown): StampTable | undefined;
  stampValue(timestamps: StampTable | null | undefined, key: string): number;
  stampWrite(
    timestamps: StampTable | null | undefined,
    key: string,
    at: number,
    options?: { field?: string; rowId?: string },
  ): StampTable;
  changedKeys(base: unknown, incoming: unknown): string[];
  buildChangeStamps(base: unknown, incoming: unknown, at: number): StampTable;
  mergeDraftSnapshot(input: MergeInput): MergeResult;
};

const mergeEngine = engine as unknown as MergeEngine;

export const MERGE_KEYS = mergeEngine.MERGE_KEYS;
export const ID_ROW_KEYS = mergeEngine.ID_ROW_KEYS;
export const SHALLOW_OBJECT_KEYS = mergeEngine.SHALLOW_OBJECT_KEYS;
export const jsonEqual = mergeEngine.jsonEqual;
export const normalizeStamp = mergeEngine.normalizeStamp;
export const mergeStamps = mergeEngine.mergeStamps;
export const stampValue = mergeEngine.stampValue;
export const stampWrite = mergeEngine.stampWrite;
export const changedKeys = mergeEngine.changedKeys;
export const buildChangeStamps = mergeEngine.buildChangeStamps;
export const mergeDraftSnapshot = mergeEngine.mergeDraftSnapshot;
