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
  assert.equal(validateMemoDraftPayload(malformed).ok, false);

  const oversized = validDraft();
  oversized.activities = Array.from({ length: 501 }, (_, index) => ({
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
      padding: "x".repeat(1_000_000),
      initialSyncComplete: true,
    }),
  }));
  assert.equal(oversizedResponse.status, 413);
});
