/**
 * Three-way merge for collaboration snapshots.
 *
 * Collaboration used to replace the whole draft on every save, so whoever wrote
 * last erased everyone else's work and a delayed request could restore an older
 * document. This module merges a sender's draft against the state that sender
 * branched from (`base`) and the room's real current state, one top-level field
 * at a time. Rows inside known id-keyed collections merge per row id, so two
 * people editing different rows of the same table keep both edits.
 *
 * Conflict ranking uses `incomingAt`, the sender's intended write time clamped
 * by the server, never the arrival order. Arrival order made a queued save win a
 * field just because it landed later.
 *
 * The same implementation runs in the Cloudflare Durable Object and in the
 * browser, so both sides always agree on the result.
 */

/** Top-level draft fields that participate in merging. */
export const MERGE_KEYS = [
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
  "attachmentsEnabled",
  "attachments",
  "contacts",
  "signers",
  "ccRecipients",
  "initials",
  "initialsBureau",
  "scenarioLetterResetPerDate",
  "appendixScenarios",
  "reviewComments",
  "reviewAuditLog",
];

/** Collections whose rows carry a stable `id` and merge row by row. */
export const ID_ROW_KEYS = [
  "recipients",
  "developmentRows",
  "activities",
  "contacts",
  "signers",
  "ccRecipients",
  "appendixScenarios",
  "reviewComments",
  "reviewAuditLog",
];

/** Keys merged key by key instead of as one value (`metadata`). */
export const SHALLOW_OBJECT_KEYS = ["metadata"];

const ID_ROW_KEY_SET = new Set(ID_ROW_KEYS);
const SHALLOW_OBJECT_KEY_SET = new Set(SHALLOW_OBJECT_KEYS);

export function jsonEqual(left, right) {
  if (left === right) return true;
  if (left === null || right === null) return false;
  if (typeof left !== typeof right) return false;
  if (typeof left !== "object") return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Numeric leaves are stamps; objects are stamp groups keyed by field/row id. */
export function normalizeStamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

export function mergeStamps(left, right) {
  if (isPlainObject(left) || isPlainObject(right)) {
    const result = {};
    const keys = new Set([
      ...Object.keys(isPlainObject(left) ? left : {}),
      ...Object.keys(isPlainObject(right) ? right : {}),
    ]);
    for (const key of keys) {
      const merged = mergeStamps(
        isPlainObject(left) ? left[key] : undefined,
        isPlainObject(right) ? right[key] : undefined,
      );
      if (merged !== undefined) result[key] = merged;
    }
    return result;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) {
    return undefined;
  }
  return Math.max(
    Number.isFinite(leftNumber) ? leftNumber : 0,
    Number.isFinite(rightNumber) ? rightNumber : 0,
  );
}

export function stampValue(timestamps, key) {
  const entry = timestamps?.[key];
  if (isPlainObject(entry)) return normalizeStamp(entry.value);
  return normalizeStamp(entry);
}

function stampFieldValue(timestamps, key, field) {
  const entry = timestamps?.[key];
  if (!isPlainObject(entry)) return 0;
  return normalizeStamp(entry.fields?.[field]);
}

function stampRowValue(timestamps, key, rowId) {
  const entry = timestamps?.[key];
  if (!isPlainObject(entry)) return 0;
  return normalizeStamp(entry.rows?.[rowId]);
}

/**
 * Records a write on one field, one `metadata` sub-key, or one row id so later
 * conflicts resolve by "who wrote most recently".
 */
export function stampWrite(timestamps, key, at, options = {}) {
  const stamp = normalizeStamp(at);
  const previous = isPlainObject(timestamps?.[key]) ? timestamps[key] : {};
  const next = {
    ...previous,
    value: Math.max(normalizeStamp(previous.value), stamp),
  };
  if (options.field) {
    next.fields = {
      ...(isPlainObject(previous.fields) ? previous.fields : {}),
      [options.field]: Math.max(normalizeStamp(previous.fields?.[options.field]), stamp),
    };
  }
  if (options.rowId) {
    next.rows = {
      ...(isPlainObject(previous.rows) ? previous.rows : {}),
      [options.rowId]: Math.max(normalizeStamp(previous.rows?.[options.rowId]), stamp),
    };
  }
  return { ...(isPlainObject(timestamps) ? timestamps : {}), [key]: next };
}

/** Every top-level field the sender changed relative to `base`. */
export function changedKeys(base, incoming) {
  const keys = [];
  for (const key of MERGE_KEYS) {
    const incomingValue = incoming?.[key];
    if (incomingValue === undefined) continue;
    if (!jsonEqual(incomingValue, base?.[key])) keys.push(key);
  }
  return keys;
}

function rowIndex(rows) {
  const index = new Map();
  if (!Array.isArray(rows)) return index;
  for (const row of rows) {
    if (isPlainObject(row) && typeof row.id === "string" && row.id) {
      index.set(row.id, row);
    }
  }
  return index;
}

function hasSameOrder(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((row, index) => row?.id === right[index]?.id);
}

/**
 * Builds the stamp table a client would send for one save: a shared, testable
 * description of what the user actually changed.
 */
export function buildChangeStamps(base, incoming, at) {
  const stamp = normalizeStamp(at) || Date.now();
  let timestamps = {};

  for (const key of MERGE_KEYS) {
    const incomingValue = incoming?.[key];
    if (incomingValue === undefined) continue;
    const baseValue = base?.[key];
    if (jsonEqual(incomingValue, baseValue)) continue;

    timestamps = stampWrite(timestamps, key, stamp);

    if (ID_ROW_KEY_SET.has(key) && Array.isArray(incomingValue)) {
      const baseRows = rowIndex(baseValue);
      const senderRows = rowIndex(incomingValue);
      let structural = !hasSameOrder(baseValue, incomingValue);
      for (const [id, row] of senderRows) {
        const baseRow = baseRows.get(id);
        if (baseRow === undefined || !jsonEqual(row, baseRow)) {
          timestamps = stampWrite(timestamps, key, stamp, { rowId: id });
        }
      }
      for (const id of baseRows.keys()) {
        if (!senderRows.has(id)) structural = true;
      }
      if (structural) {
        timestamps = stampWrite(timestamps, key, stamp);
      }
    }

    if (SHALLOW_OBJECT_KEY_SET.has(key) && isPlainObject(incomingValue)) {
      const baseObject = isPlainObject(baseValue) ? baseValue : {};
      for (const field of Object.keys(incomingValue)) {
        if (!jsonEqual(incomingValue[field], baseObject[field])) {
          timestamps = stampWrite(timestamps, key, stamp, { field });
        }
      }
    }
  }

  return timestamps;
}

function mergeRowCollection({
  key,
  base,
  current,
  incoming,
  incomingAt,
  roomStamps,
}) {
  const baseRows = rowIndex(base);
  const currentRows = rowIndex(current);
  const incomingRows = rowIndex(incoming);
  const currentList = Array.isArray(current) ? current.filter(isPlainObject) : [];
  const incomingList = Array.isArray(incoming) ? incoming.filter(isPlainObject) : [];

  const resolved = new Map();
  const order = [];
  const rowStamps = {};
  const pushOrder = (id) => {
    if (!order.includes(id)) order.push(id);
  };

  // Order follows the sender only when it actually reordered and wrote later.
  const senderReordered = !hasSameOrder(base, incoming) &&
    incomingAt >= stampValue(roomStamps, key);
  const primary = senderReordered ? incomingList : currentList;
  const secondary = senderReordered ? currentList : incomingList;
  for (const row of primary) pushOrder(row.id);
  for (const row of secondary) pushOrder(row.id);
  for (const row of incomingList) pushOrder(row.id);

  for (const id of order) {
    const baseRow = baseRows.get(id);
    const currentRow = currentRows.get(id);
    const incomingRow = incomingRows.get(id);

    if (incomingRow === undefined) {
      // The sender dropped a row. It stays gone only when the room still holds
      // the version the sender branched from.
      if (currentRow !== undefined && !jsonEqual(currentRow, baseRow)) {
        resolved.set(id, { row: currentRow });
      }
      continue;
    }

    if (jsonEqual(incomingRow, baseRow)) {
      // The sender never touched this row; the room keeps whatever it has.
      if (currentRow !== undefined) {
        resolved.set(id, { row: currentRow });
      }
      continue;
    }

    if (currentRow === undefined || jsonEqual(currentRow, baseRow)) {
      resolved.set(id, { row: incomingRow });
      rowStamps[id] = incomingAt;
      continue;
    }

    // Both sides changed this row: newest intended write wins.
    const roomRowStamp = stampRowValue(roomStamps, key, id);
    if (incomingAt >= roomRowStamp) {
      resolved.set(id, { row: incomingRow });
      rowStamps[id] = incomingAt;
    } else {
      resolved.set(id, { row: currentRow });
      rowStamps[id] = roomRowStamp;
    }
  }

  const value = [];
  for (const id of order) {
    const entry = resolved.get(id);
    if (entry?.row) value.push(entry.row);
  }
  const structuralStamp = senderReordered
    ? incomingAt
    : stampValue(roomStamps, key);
  return { value, rowStamps, structuralStamp };
}

function mergeShallowObject({ key, base, current, incoming, incomingAt, roomStamps }) {
  const baseObject = isPlainObject(base) ? base : {};
  const currentObject = isPlainObject(current) ? current : {};
  const incomingObject = isPlainObject(incoming) ? incoming : {};
  const result = { ...currentObject };
  const changed = [];

  for (const field of Object.keys(incomingObject)) {
    const baseValue = baseObject[field];
    const currentValue = currentObject[field];
    const incomingValue = incomingObject[field];
    if (jsonEqual(incomingValue, baseValue)) continue;
    if (
      jsonEqual(currentValue, baseValue) ||
      incomingAt >= stampFieldValue(roomStamps, key, field)
    ) {
      result[field] = incomingValue;
      changed.push(field);
    }
  }

  return { value: result, changed };
}

/**
 * Three-way merge of one sender's snapshot into the room state.
 *
 * `base` is the ancestor the sender branched from, `current` is the room state,
 * `incoming` is the sender's draft, and `incomingAt` is the sender's intended
 * write time. Extra properties on the input are ignored.
 */
export function mergeDraftSnapshot({
  base,
  current,
  incoming,
  timestamps,
  incomingAt,
}) {
  const now = normalizeStamp(incomingAt) || Date.now();
  const roomStamps = isPlainObject(timestamps) ? timestamps : {};
  const baseDraft = isPlainObject(base) ? base : {};
  const incomingDraft = isPlainObject(incoming) ? incoming : {};
  const currentDraft = isPlainObject(current) ? current : null;

  if (!currentDraft) {
    const draft = {};
    const mergedKeys = [];
    for (const key of MERGE_KEYS) {
      if (incomingDraft[key] === undefined) continue;
      draft[key] = incomingDraft[key];
      mergedKeys.push(key);
    }
    // The room had nothing yet, so every field the sender changed relative to
    // its own base is recorded with the same granularity as any later save.
    const stamps = mergeStamps(
      roomStamps,
      buildChangeStamps(baseDraft, incomingDraft, now),
    ) ?? {};
    return { draft, timestamps: stamps, mergedAt: now, mergedKeys };
  }

  const draft = {};
  let stamps = roomStamps;
  const mergedKeys = [];

  for (const key of MERGE_KEYS) {
    const baseValue = baseDraft[key];
    const currentValue = currentDraft[key];
    const incomingValue = incomingDraft[key];

    if (incomingValue === undefined) {
      if (currentValue !== undefined) draft[key] = currentValue;
      continue;
    }

    if (jsonEqual(incomingValue, baseValue)) {
      if (currentValue !== undefined) draft[key] = currentValue;
      continue;
    }

    if (jsonEqual(currentValue, baseValue)) {
      draft[key] = incomingValue;
      stamps = stampWrite(stamps, key, now);
      mergedKeys.push(key);
      continue;
    }

    if (ID_ROW_KEY_SET.has(key) && Array.isArray(incomingValue)) {
      const merged = mergeRowCollection({
        key,
        base: baseValue,
        current: currentValue,
        incoming: incomingValue,
        incomingAt: now,
        roomStamps,
      });
      draft[key] = merged.value;
      if (!jsonEqual(merged.value, currentValue)) {
        let next = stampWrite(stamps, key, merged.structuralStamp);
        for (const [rowId, at] of Object.entries(merged.rowStamps)) {
          next = stampWrite(next, key, at, { rowId });
        }
        stamps = next;
        mergedKeys.push(key);
      }
      continue;
    }

    if (SHALLOW_OBJECT_KEY_SET.has(key) && isPlainObject(incomingValue)) {
      const merged = mergeShallowObject({
        key,
        base: baseValue,
        current: currentValue,
        incoming: incomingValue,
        incomingAt: now,
        roomStamps,
      });
      draft[key] = merged.value;
      if (merged.changed.length) {
        let next = stampWrite(stamps, key, now);
        for (const field of merged.changed) {
          next = stampWrite(next, key, now, { field });
        }
        stamps = next;
        mergedKeys.push(key);
      }
      continue;
    }

    // Scalar or rich-text conflict: newest intended write wins.
    if (now >= stampValue(roomStamps, key)) {
      draft[key] = incomingValue;
      stamps = stampWrite(stamps, key, now);
      mergedKeys.push(key);
    } else {
      draft[key] = currentValue;
    }
  }

  for (const key of MERGE_KEYS) {
    if (draft[key] === undefined && currentDraft[key] !== undefined) {
      draft[key] = currentDraft[key];
    }
  }

  return { draft, timestamps: stamps, mergedAt: now, mergedKeys };
}

/** Client-side rebase: re-apply local edits on top of the room state. */
export function rebaseLocalDraft({
  base,
  remote,
  local,
  timestamps,
  localAt,
}) {
  return mergeDraftSnapshot({
    base,
    current: remote,
    incoming: local,
    timestamps,
    incomingAt: localAt,
  });
}
