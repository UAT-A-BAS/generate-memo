import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_REQUEST_BODY_BYTES,
  MAX_SNAPSHOTS,
  nextServerTimestamp,
  validateMemoDraftPayload,
} from "../workers/collab/draftValidation.mjs";
import { MemoRoom } from "../workers/collab/worker.js";
import { buildChangeStamps } from "../workers/collab/draftMerge.mjs";

const richText = {
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
};

function validDraft() {
  return {
    id: "draft-test",
    version: 1,
    metadata: {
      noMemo: "1",
      releaseDate: "2026-07-24",
      memoType: "Pilot",
      projectName: "Test",
      bureau: "A",
      perihal: "Test",
      autoPerihal: true,
      accessLinkEnabled: false,
      accessLink: "",
    },
    recipients: [{ id: "recipient-1", gender: "Yth.", position: "Tester" }],
    introduction: richText,
    referenceEnabled: false,
    reference: richText,
    developmentRows: [{ id: "dev-1", item: richText, description: richText }],
    pilotSchedule: { startDate: "", endDate: "", dates: [] },
    activities: [{
      id: "activity-1",
      startDate: "",
      endDate: "",
      dates: [],
      activity: richText,
      owner: "",
    }],
    attachmentsEnabled: false,
    attachments: "",
    contacts: [{ id: "contact-1", name: "", email: "" }],
    signers: [{ id: "signer-1", name: "", title: "" }],
    ccRecipients: [{ id: "cc-1", gender: "", position: "" }],
    initials: "",
    initialsBureau: "A",
    scenarioLetterResetPerDate: true,
    appendixScenarios: [{
      id: "scenario-1",
      dateGroupId: "date-1",
      sectionGroupId: "section-1",
      headingPath: [{ id: "section-1", title: "" }],
      startDate: "",
      endDate: "",
      dates: [],
      section: "",
      scenario: richText,
      expectedResult: richText,
      pic: "",
      notes: richText,
    }],
    reviewComments: [],
    reviewAuditLog: [],
    updatedAt: "2026-07-24T00:00:00.000Z",
  };
}

function roomState() {
  const values = new Map();
  return {
    storage: {
      get: async (key) => values.get(key),
      put: async (key, value) => values.set(key, value),
    },
  };
}

test("rejects malformed and oversized draft collections", () => {
  const malformed = validDraft();
  malformed.activities = [null];
  assert.equal(validateMemoDraftPayload(malformed).ok, false);

  const largeButValid = validDraft();
  largeButValid.activities = Array.from({ length: 501 }, (_, index) => ({
    ...validDraft().activities[0],
    id: `activity-${index}`,
  }));
  assert.equal(validateMemoDraftPayload(largeButValid).ok, true);

  const oversized = validDraft();
  oversized.activities = Array.from({ length: 5_001 }, (_, index) => ({
    ...validDraft().activities[0],
    id: `activity-${index}`,
  }));
  assert.equal(validateMemoDraftPayload(oversized).ok, false);
});

test("server timestamp clamps future clients and remains monotonic", () => {
  const now = 1_000_000;
  const first = nextServerTimestamp(0, now + 10 * MAX_CLOCK_SKEW_MS, now);
  assert.equal(first, now + MAX_CLOCK_SKEW_MS);
  assert.equal(nextServerTimestamp(first, 1, now), first + 1);
});

test("room retains only the newest bounded snapshots", async () => {
  const room = new MemoRoom(roomState());

  for (let index = 0; index < MAX_SNAPSHOTS + 5; index += 1) {
    const saved = await room.saveDraftSnapshot({
      draft: {
        ...validDraft(),
        metadata: {
          ...validDraft().metadata,
          projectName: `Snapshot ${index}`,
        },
      },
      updatedAt: Date.now(),
      userId: "worker-test",
    });
    assert.ok(saved);
  }

  const map = room.doc.getMap("form");
  const snapshotKeys = [...map.keys()].filter((key) => key.startsWith("snapshot:"));
  assert.equal(snapshotKeys.length, MAX_SNAPSHOTS);
});

test("HTTP persistence rejects malformed and oversized requests", async () => {
  const room = new MemoRoom(roomState());
  const malformed = validDraft();
  malformed.activities = [null];
  const malformedResponse = await room.fetch(new Request("https://room.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draft: malformed,
      initialSyncComplete: true,
    }),
  }));
  assert.equal(malformedResponse.status, 400);

  const oversizedResponse = await room.fetch(new Request("https://room.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draft: validDraft(),
      padding: "x".repeat(MAX_REQUEST_BODY_BYTES),
      initialSyncComplete: true,
    }),
  }));
  assert.equal(oversizedResponse.status, 413);
});

function draftWith(patch) {
  const draft = validDraft();
  return {
    ...draft,
    ...patch,
    metadata: { ...draft.metadata, ...(patch.metadata ?? {}) },
  };
}

function saveFor(room, draft, base, options = {}) {
  const updatedAt = options.updatedAt ?? Date.now();
  return room.saveDraftSnapshot({
    draft,
    base,
    baseRevision: options.baseRevision ?? 0,
    timestamps: buildChangeStamps(base, draft, updatedAt),
    updatedAt,
    saveId: options.saveId,
    clientId: options.clientId ?? "test-client",
    user: { id: options.userId ?? "tester" },
  });
}

test("two collaborators editing different fields both survive", async () => {
  const room = new MemoRoom(roomState());
  const base = validDraft();

  const first = await saveFor(
    room,
    draftWith({ metadata: { projectName: "Proyek A" } }),
    base,
  );
  assert.equal(first.revision, 1);
  assert.equal(first.draft.metadata.projectName, "Proyek A");

  // Second writer still believes the room is empty (stale revision) but only
  // touched `perihal`; the first writer's project name must survive.
  const second = await saveFor(
    room,
    draftWith({ metadata: { perihal: "Perihal B" } }),
    base,
  );
  assert.equal(second.draft.metadata.projectName, "Proyek A");
  assert.equal(second.draft.metadata.perihal, "Perihal B");
});

test("table rows edited by different collaborators both survive", async () => {
  const room = new MemoRoom(roomState());
  const base = validDraft();
  base.activities = [
    { ...validDraft().activities[0], id: "activity-1", owner: "" },
    { ...validDraft().activities[0], id: "activity-2", owner: "" },
  ];
  await saveFor(room, base, base);

  const firstEdit = {
    ...base,
    activities: [
      { ...base.activities[0], owner: "PIC Satu" },
      base.activities[1],
    ],
  };
  const first = await saveFor(room, firstEdit, base);
  assert.equal(first.draft.activities[0].owner, "PIC Satu");

  const secondEdit = {
    ...base,
    activities: [
      base.activities[0],
      { ...base.activities[1], owner: "PIC Dua" },
    ],
  };
  const second = await saveFor(room, secondEdit, base);
  assert.equal(second.draft.activities[0].owner, "PIC Satu");
  assert.equal(second.draft.activities[1].owner, "PIC Dua");
});

test("the newest write wins when two collaborators touch the same field", async () => {
  const room = new MemoRoom(roomState());
  const base = validDraft();
  const start = Date.now();

  await saveFor(
    room,
    draftWith({ metadata: { projectName: "Versi Pertama" } }),
    base,
    { updatedAt: start, userId: "writer-one" },
  );
  const later = await saveFor(
    room,
    draftWith({ metadata: { projectName: "Versi Kedua" } }),
    base,
    { updatedAt: start + 5_000, userId: "writer-two" },
  );

  assert.equal(later.draft.metadata.projectName, "Versi Kedua");
});

test("a replayed save id is idempotent and never bumps the revision", async () => {
  const room = new MemoRoom(roomState());
  const base = validDraft();
  const draft = draftWith({ metadata: { projectName: "Idempoten" } });
  const updatedAt = Date.now();

  const first = await saveFor(room, draft, base, {
    updatedAt,
    saveId: "replay-1",
    userId: "writer-one",
  });
  const replayed = await saveFor(room, draft, base, {
    updatedAt: updatedAt + 1_000,
    saveId: "replay-1",
    userId: "writer-one",
  });

  assert.equal(first.revision, 1);
  assert.equal(replayed.revision, 1);
  assert.equal(replayed.replayed, true);
});

test("a delayed save can no longer roll a newer document back", async () => {
  const room = new MemoRoom(roomState());
  const base = validDraft();
  const stale = draftWith({ metadata: { projectName: "Draft Lama" } });
  const fresh = draftWith({ metadata: { projectName: "Draft Baru" } });
  const start = Date.now();

  await saveFor(room, fresh, base, { updatedAt: start + 5_000, userId: "writer-two" });
  const late = await saveFor(room, stale, base, {
    updatedAt: start,
    userId: "writer-one",
  });

  assert.equal(late.draft.metadata.projectName, "Draft Baru");
  assert.equal(room.doc.getMap("form").get("data").metadata.projectName, "Draft Baru");
});
