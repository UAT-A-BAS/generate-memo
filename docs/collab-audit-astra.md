# Collaboration audit (Astra)

Audit date: 2026-09-17. Source baseline: `6322b32f6a93d2a808fe958ba474037bc406679c`.
This is a source audit of the pre-fix implementation, not a claim about deployed behavior. Line references below identify that baseline; subsequent edits may move them. No server, deployment, or test suite was started for this audit.

## 1. Architecture map

1. UI changes update the in-memory Zustand draft (`src/store/useMemoDraftStore.ts:68`, `:88`). `MemoBuilderApp` subscribes to it and passes `draft` and `replaceDraft` into the collaboration hook (`src/features/memo-builder/MemoBuilderApp.tsx:3112`, `:3127`). Personal draft initialization explicitly starts fresh (`src/store/useMemoDraftStore.ts:160`); pending collaboration edits do not have a durable outbox in this hook.
2. The hook stores a draft ref, compares normalized JSON excluding `draft.updatedAt`, and debounces saves for 2,500 ms (`src/collaboration/useMemoCollaboration.ts:77`, `:197`, `:314`, `:880`). Each flush writes the entire draft to the local Y.Map `form.data` and sends JSON `draft-save`, not a Yjs operation update (`:523`, `:614`).
3. WebSocket and HTTP both target `/collab/generate-memo:<room>` on the configured Worker (`src/collaboration/useMemoCollaboration.ts:152`, `:161`). The default is `generate-memo-collab.alex-marcello08.workers.dev`; remote pages reject a configured loopback host (`src/collaboration/workerUrl.ts:9`, `:21`). Offline builds set a literal disabled flag (`:7`). Actual production reachability is unverified.
4. The Worker routes a room name to `MEMO_ROOMS.idFromName` (`workers/collab/worker.js:378`). `MemoRoom` serializes saves through `enqueue` (`:110`, `:197`, `:244`), validates draft shape, replaces `form.data`, and assigns a server-adjusted timestamp (`:149`). It persists an encoded Y.Doc plus `latestDraft` (`:137`). Twenty full draft snapshots are retained (`:75`; `workers/collab/draftValidation.mjs:3`).
5. On connect, the server sends JSON `room-snapshot` followed by its full encoded Y.Doc (`workers/collab/worker.js:230`). Later saves broadcast a full JSON `draft-update` to other sessions and return `saved` to the sender (`:168`, `:291`). The client accepts either whole remote draft or whole local draft, calls `replaceDraft`, and marks Saved (`src/collaboration/useMemoCollaboration.ts:564`, `:584`, `:779`). `replaceDraft` also clears undo history and the active edit checkpoint (`src/store/useMemoDraftStore.ts:151`).

## 2. Root causes ranked by severity

### P1 / R1. Every save replaces the whole memo, including untouched fields

**Symptom:** Two users editing different fields can erase each other's work.
**Location:** `src/collaboration/useMemoCollaboration.ts:533`; `workers/collab/worker.js:149-175`, `:255-261`.
**Mechanism:** Every client sends its entire locally observed draft. The Worker unconditionally sets one plain object at `form.data`; no base revision, field diff, row-ID merge, or stale-save rejection is present. Queueing orders replacements but does not merge them. If A changes project name and B changes a contact from the same starting memo, the last accepted snapshot also restores the untouched stale field from that sender.
**Yjs scope:** The draft is not modeled with nested Y.Map/Y.Text types. Client saves are JSON, and the Worker explicitly ignores otherwise valid inbound binary updates. Yjs therefore does not provide content-level collaboration here.

### P1 / R2. Receiving a newer remote snapshot discards unsent local edits and pending-save tracking

**Symptom:** Text disappears during the debounce interval; the UI can report Saved for a remote state while the local operation was never acknowledged.
**Location:** `src/collaboration/useMemoCollaboration.ts:564-595`, `:330-334`, `:500-506`, `:880-897`.
**Mechanism:** The only protection is `(dirty || pending) && localUpdatedAt > remoteUpdatedAt`. The local value uses `Date.now()`, while the remote value is advanced on receipt at the server. A remote save arriving after a local keystroke can therefore replace the complete local draft, even when the users touched different fields. After replacement, `applySharedDraft` first assigns `localUpdatedAt = updatedAt`; the subsequent `updatedAt >= localUpdatedAt` test is necessarily true. `clearSyncAck()` then clears the outstanding save ID regardless of which operation the remote update represents. No saved local diff is rebased onto the incoming draft.

### P1 / R3. Reconnect chooses a whole-draft winner using clocks and a locally mutated Y.Doc

**Symptom:** Reconnecting either loses offline edits or republishes stale untouched fields over another user's newer work.
**Location:** `src/collaboration/useMemoCollaboration.ts:243-262`, `:553-561`, `:597-609`, `:685-688`, `:754-815`.
**Mechanism:** The same Y.Doc survives socket reconnects. Its local writes include full snapshots. The next server binary snapshot is merged into that local doc, and `sharedDraftStateFromMap` selects the snapshot with the greatest timestamp, which need not be the canonical server draft. The client then compares local and remote timestamps and either commits the entire local draft or replaces it entirely with remote state. It never combines the offline change set with changes that arrived while disconnected. A future local clock also remains in local snapshot keys; server-side clock clamping does not remove those keys.
**Boundary:** This establishes an unsafe algorithm directly from source. The frequency of the stale-Yjs-snapshot subcase in production is unverified.

### P1 / R4. Idle and unload double-submit stale full snapshots without idempotency

**Symptom:** A change appears synchronized, then rolls back after another tab idles or closes.
**Location:** `src/collaboration/useMemoCollaboration.ts:216-232`, `:614-645`, `:916-925`, `:1048-1060`; `workers/collab/worker.js:195-205`, `:291-299`.
**Mechanism:** Idle and page exit flush both WS and HTTP unconditionally, including when the draft is clean. The HTTP payload has no `saveId`; the Worker does not deduplicate saves on either transport. WS snapshot A can arrive, then peer edit B, then delayed HTTP snapshot A. The final A is accepted as a newer complete memo. Both `beforeunload` and `pagehide` call the same flush, adding another duplicate path. A newer server timestamp does not mean newer user intent.
**Boundary:** The source confirms duplicate transmission and unconditional overwrite. The precise transport arrival order is timing dependent.

### P2 / R5. Network restoration does not automatically resume a socket closed while offline

**Symptom:** A user stays disconnected after connectivity returns until a qualifying activity event occurs.
**Location:** `src/collaboration/useMemoCollaboration.ts:818-844`, `:900-914`, `:944-977`.
**Mechanism:** The close handler exits without scheduling reconnect when `navigator.onLine` is false. The online handler only calls `updateStatus`; it never calls the socket resume routine. Mouse/key activity may recover the connection because it sees a missing socket, but passive recipients can remain stale indefinitely.

Other observations, not established primary causes: snapshot count pruning exists, so unbounded snapshot-count growth is not a valid finding. Presence has close/error cleanup but no application heartbeat or TTL (`workers/collab/worker.js:265`, `:329`); stale presence duration is unverified. There is no explicit outgoing backpressure policy (`:317`), but no production overload evidence was collected. Persistence failures are logged without a direct save-error response (`:262`), causing recovery through ACK timeout. `nextServerTimestamp` clamps the existing timestamp too (`workers/collab/draftValidation.mjs:232`), so it is not a reliable strictly monotonic revision under future-clock saturation. A protocol revision should be an incrementing server value independent of wall time.

## 3. Ranked fix plan (smallest blast radius first)

1. **Client-only immediate recovery fix:** Resume on `online`; keep at most one connect attempt active. Skip clean idle/unload writes, and avoid WS + HTTP double-submit until idempotency is available. These reduce desync/replay opportunities but do not solve concurrent edit loss.
2. **Worker + client, recommended first complete correctness fix:** Keep the existing JSON/Durable Object architecture and add an explicit protocol version, canonical server revision, stable operation ID, and changes relative to an acknowledged base. Server applies field changes and ID-keyed row changes to current state; it returns the canonical resulting draft to sender and peers. Reject or explicitly resolve same-field conflicts rather than silently discard content. Persist deduplication state with the accepted operation. Old whole-draft clients must not retain an unrestricted overwrite path after the migration.
3. **Client:** Maintain canonical server base separately from pending local edits; rebase unsent work when updates or reconnect snapshots arrive. ACK only the exact in-flight operation. Preserve newer edits made while that operation was in flight. Retry a stable operation ID across transports. On reconnect, hydrate canonical state before replaying pending operations. Display unresolved same-field conflicts with recoverable local content if not automatically merged.
4. **Worker + client tests:** Cover two simultaneous metadata fields; same-row different-cell edits; independent row insertions; edit/delete and reorder conflicts; comments/replies; reconnect with peer changes; client clock skew; delayed HTTP after WS; duplicate ACK/retry; stale protocol clients; storage restart; online recovery. Use ID-based collections, not array indices, for mutable memo rows. Keep derived `perihal` consistent with merged metadata.
5. **Larger alternative, Worker + client/editor changes:** Proper Yjs types and editor bindings (`Y.Map`, `Y.Array`, `Y.Text`/Tiptap collaboration), validated operation transport, and incremental persistence. This supports finer text concurrency but has more migration and editor regression risk. Do not describe plain JSON inside one Y.Map key as equivalent to that solution.

## 4. Regression risks and available commands

High-risk surfaces: normalization regenerating row IDs, whole-document import/reset semantics, concurrent row order/delete, rich-text JSON atomicity, comments/replies and audit-log retention, generated perihal, reconnect after idle, undo checkpoints cleared by remote replacement, old deployed clients, and legacy persisted Y.Doc migration. Server acceptance must validate the merged result as well as inbound changes. Atomic rich-text replacement still needs an explicit same-field conflict policy.

Commands confirmed in `package.json:7-19`:

```sh
npm run test:worker
npm run test:e2e
npm run test:e2e -- e2e/collaboration-idle.spec.ts
npm run test:e2e -- e2e/memo-builder.spec.ts -g "collaboration"
npm run lint
npm run build:offline-html
```

`test:worker` currently has only four tests: malformed/oversized validation, a limited timestamp check, snapshot pruning, and invalid HTTP requests (`tests/worker-collab.test.mjs:83`, `:103`, `:110`, `:133`). It does not test concurrent saves. Existing browser tests cover sequential metadata sync and join hydration (`e2e/memo-builder.spec.ts:2962`, `:3023`), and idle/retry workflows (`e2e/collaboration-idle.spec.ts:247`, `:294`, `:316`, `:328`, `:359`). They do not establish preservation of simultaneous distinct edits. Playwright starts Wrangler on 8787 and a built static server on 3002 (`playwright.config.ts:17-32`). The offline build disables collaboration and must remain network-free; its output is not evidence that the hosted collaboration protocol works.

## 5. Evidence snippets

### R1: whole-draft last arrival wins

```text
src/collaboration/useMemoCollaboration.ts:533-536
socket.send(JSON.stringify({
  type: "draft-save",
  draft: normalized,
  updatedAt,

workers/collab/worker.js:160-164
this.doc.transact(() => {
  map.set(DATA_KEY, message.draft);
  map.set(UPDATED_AT_KEY, updatedAt);
  map.set(UPDATED_BY_KEY, userId);
  map.set(snapshotKey(updatedAt, userId), message.draft);

workers/collab/worker.js:261
this.logError("unexpected_binary_message", new Error("UnexpectedBinaryMessage"), sessionId);
```

### R2: timestamp gate followed by replacement and unconditional pending cleanup

```text
src/collaboration/useMemoCollaboration.ts:573-576
localBaselineRef.current = draftSyncKey(nextDraft);
localUpdatedAtRef.current = updatedAt;
replaceDraft(nextDraft, "loaded");
syncRemoteMap(nextDraft, updatedAt, updatedBy);

src/collaboration/useMemoCollaboration.ts:586-594
const localIsDirty = draftSyncKey(draftRef.current) !== localBaselineRef.current;
if ((localIsDirty || pendingStateUpdateRef.current) && localUpdatedAtRef.current > updatedAt) {
  return;
}
applySharedDraft(nextDraft, updatedAt, updatedBy);
if (updatedAt >= localUpdatedAtRef.current) {
  pendingStateUpdateRef.current = false;
  clearSyncAck();
}
```

### R3: local/server whole-draft choice, no rebase

```text
src/collaboration/useMemoCollaboration.ts:251-255
const updatedAt = Number(key.slice(SNAPSHOT_PREFIX.length).split(":")[0] || "0");
if (updatedAt >= latestUpdatedAt) {
  latestUpdatedAt = updatedAt;
  latestData = value;
}

src/collaboration/useMemoCollaboration.ts:785-788
const localShouldWin = Boolean(
  (pendingSeed && (!hasRemoteDraft || pendingSeedMustWin)) ||
  (!pendingSeed && !firstConnection && (localIsDirty || pendingStateUpdateRef.current) && localUpdatedAtRef.current >= remoteUpdatedAt),
);
```

### R4: idle submits the same snapshot on both channels

```text
src/collaboration/useMemoCollaboration.ts:921-925
flushSharedDraftRef.current?.({
  keepalive,
  persistHttp: true,
  sendSocket: true,
});

workers/collab/worker.js:195-198
const message = safeJsonParse(rawMessage);
const saved = message?.initialSyncComplete === true
  ? await this.enqueue(() => this.saveDraftSnapshot(message, ""))
  : null;
```

### R5: close suppresses retry while offline; online only updates a label

```text
src/collaboration/useMemoCollaboration.ts:830-836
if (
  suppressReconnectRef.current ||
  idlePausedRef.current ||
  document.hidden ||
  !navigator.onLine
) {
  return;

src/collaboration/useMemoCollaboration.ts:906-909
updateStatus(navigator.onLine ? state.status : "offline");
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
```

## Resolution (implemented after this audit)

The causes above were fixed in the same day's change set:

- **Per-field / per-row merge.** `workers/collab/draftMerge.mjs` now performs a three-way merge (base ancestor, room state, incoming edit) over top-level fields, `metadata` sub-keys, and id-keyed table rows. The same module runs in the Worker and in the browser (`src/collaboration/draftMerge.ts`), so both sides resolve conflicts identically.
- **Base + revision protocol.** Each save carries `base`, `baseRevision`, and a `timestamps` change-stamp table. Records without a comparable base fall back to the room draft as ancestor, which can only add fields the room never had.
- **Server-authoritative result.** The Worker increments a room `revision`, stores an idempotency receipt per `saveId`, and broadcasts the merged room state instead of the raw sender payload.
- **Client rebase.** `adoptRoomDraft` re-applies unsent local edits on top of the merged room state instead of discarding either side.
- **Delayed-save rollback.** Conflicts are ranked by the sender's clamped intended write time, not arrival order, so a queued stale save can no longer win a field.
- **Reconnect after network loss.** The `online` handler resumes the room and retries pending edits.

Evidence: `npm run test:worker` (9 cases), the collaboration Playwright specs, and a live check against the deployed Worker
(`generate-memo-collab.alex-marcello08.workers.dev`) confirming field merge, idempotent replay, no rollback from a delayed save, and `413` on oversized payloads.
