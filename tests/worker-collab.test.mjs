import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CLOCK_SKEW_MS,
  MAX_SNAPSHOTS,
  nextServerTimestamp,
  validateMemoDraftPayload,
} from "../workers/collab/draftValidation.mjs";
import { MemoRoom } from "../workers/collab/worker.js";

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
  const malformedResult = validateMemoDraftPayload(malformed);
  assert.equal(malformedResult.ok, false);
  assert.equal(malformedResult.code, "row_type_invalid");
  assert.equal(malformedResult.field, "activities[0]");

  const oversized = validDraft();
  oversized.activities = Array.from({ length: 501 }, (_, index) => ({
    ...validDraft().activities[0],
    id: `activity-${index}`,
  }));
  const oversizedResult = validateMemoDraftPayload(oversized);
  assert.equal(oversizedResult.ok, false);
  assert.equal(oversizedResult.code, "collection_limit");
  assert.equal(oversizedResult.field, "activities");
  assert.equal(oversizedResult.actual, 501);
  assert.equal(oversizedResult.limit, 500);

  const longText = validDraft();
  longText.metadata.projectName = "x".repeat(100_001);
  const longTextResult = validateMemoDraftPayload(longText);
  assert.equal(longTextResult.ok, false);
  assert.equal(longTextResult.code, "string_limit");
  assert.equal(longTextResult.field, "draft.metadata.projectName");
  assert.equal(longTextResult.actual, 100_001);
  assert.equal(longTextResult.limit, 100_000);
});

test("WebSocket save errors expose safe field and limit diagnostics", async () => {
  const room = new MemoRoom(roomState());
  const messages = [];
  room.sessions.set("session-test", {
    initialSyncComplete: true,
    user: null,
    socket: {
      send: (value) => messages.push(JSON.parse(value)),
    },
  });
  const oversized = validDraft();
  oversized.activities = Array.from({ length: 501 }, (_, index) => ({
    ...validDraft().activities[0],
    id: `activity-${index}`,
  }));

  await room.handleTextMessage("session-test", JSON.stringify({
    type: "draft-save",
    draft: oversized,
    saveId: "save-test",
  }));

  assert.deepEqual(messages, [{
    type: "save-error",
    saveId: "save-test",
    error: "collection_limit",
    validation: {
      code: "collection_limit",
      field: "activities",
      actual: 501,
      limit: 500,
      message: "Jumlah item pada koleksi draft melebihi batas.",
    },
  }]);
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
  assert.deepEqual(await malformedResponse.json(), {
    ok: false,
    error: "row_type_invalid",
    validation: {
      code: "row_type_invalid",
      field: "activities[0]",
      message: "Baris draft harus berupa objek.",
    },
  });

  const oversizedResponse = await room.fetch(new Request("https://room.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      draft: validDraft(),
      padding: "x".repeat(1_000_000),
      initialSyncComplete: true,
    }),
  }));
  assert.equal(oversizedResponse.status, 413);
  assert.deepEqual(await oversizedResponse.json(), {
    ok: false,
    error: "payload_too_large",
    validation: {
      code: "payload_too_large",
      field: "draft",
      limit: 1_000_000,
      message: "Ukuran snapshot draft melebihi batas HTTP.",
    },
  });
});
