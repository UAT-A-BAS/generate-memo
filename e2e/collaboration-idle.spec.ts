import { expect, test, type Page } from "@playwright/test";
import * as Y from "yjs";
import {
  DEFAULT_COLLAB_WORKER_URL,
  resolveCollaborationWorkerBaseUrl,
} from "../src/collaboration/workerUrl";
import { validateMemoDraftPayload } from "../workers/collab/draftValidation.mjs";

declare global {
  interface Window {
    __memoWs: {
      closes: string[];
      instances: Array<{
        url: string;
        readyState: number;
        serverMessage: (value: unknown) => void;
      }>;
      sends: Array<{ kind: string; value: string }>;
    };
  }
}

type FakeSocketOptions = {
  autosaveMs?: number;
  idleMs?: number;
};

async function installFakeCollaborationSocket(
  page: Page,
  serverUpdateBase64 = "",
  options: FakeSocketOptions = {},
) {
  await page.addInitScript(({ initialServerUpdate, timerOverrides }) => {
    const NativeWebSocket = window.WebSocket;
    Object.defineProperty(window, "__MEMO_COLLAB_IDLE_TIMERS__", {
      configurable: true,
      value: {
        idleMs: timerOverrides.idleMs ?? 200,
        hiddenGraceMs: 100,
        autosaveMs: timerOverrides.autosaveMs ?? 50,
        reconnectBaseMs: 80,
        reconnectMaxMs: 200,
        idleCloseDelayMs: 0,
      },
    });

    Object.defineProperty(window, "__memoWs", {
      configurable: true,
      value: {
        closes: [] as string[],
        instances: [] as Array<{
          url: string;
          readyState: number;
          serverMessage: (value: unknown) => void;
        }>,
        sends: [] as Array<{ kind: string; value: string }>,
      },
    });

    class FakeWebSocket extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      CONNECTING = 0;
      OPEN = 1;
      CLOSING = 2;
      CLOSED = 3;
      binaryType = "blob";
      readyState = FakeWebSocket.CONNECTING;
      url: string;

      constructor(url: string) {
        super();
        this.url = url;
        window.__memoWs.instances.push(this);
        window.setTimeout(() => {
          if (this.readyState !== FakeWebSocket.CONNECTING) return;
          this.readyState = FakeWebSocket.OPEN;
          this.dispatchEvent(new Event("open"));
          const binaryUpdate = initialServerUpdate
            ? Uint8Array.from(atob(initialServerUpdate), (character) => character.charCodeAt(0)).buffer
            : new Uint8Array([0, 0]).buffer;
          this.dispatchEvent(new MessageEvent("message", {
            data: binaryUpdate,
          }));
        }, 0);
      }

      send(data: string | ArrayBuffer | Blob | ArrayBufferView) {
        window.__memoWs.sends.push({
          kind: typeof data === "string" ? "text" : "binary",
          value: typeof data === "string" ? data : "binary",
        });
      }

      serverMessage(value: unknown) {
        this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify(value),
        }));
      }

      close() {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        window.__memoWs.closes.push(this.url);
        this.dispatchEvent(new CloseEvent("close"));
      }
    }

    const RoutedWebSocket = new Proxy(NativeWebSocket, {
      construct(Target, args) {
        const url = String(args[0] ?? "");
        if (url.includes("/collab/")) {
          return new FakeWebSocket(url);
        }
        return Reflect.construct(Target, args);
      },
    });

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: RoutedWebSocket,
    });
  }, {
    initialServerUpdate: serverUpdateBase64,
    timerOverrides: options,
  });
}

async function startCollaboration(page: Page) {
  await page.goto("http://localhost:3002");
  await page.getByRole("button", { name: "Start Collab" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await identityDialog.getByLabel("Nama *").fill("Idle Tester");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByRole("button", { name: "Restart Collab" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__memoWs.instances.length)).toBeGreaterThan(0);
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    window.__memoWs.closes = [];
  });
  return page.evaluate(() => window.__memoWs.instances.length);
}

type SentDraftSave = {
  type: "draft-save";
  saveId: string;
  draft: unknown;
};

async function sentDraftSaves(page: Page): Promise<SentDraftSave[]> {
  return page.evaluate(() => window.__memoWs.sends
    .filter((message) => message.kind === "text")
    .map((message) => JSON.parse(message.value) as { type?: string })
    .filter((message): message is SentDraftSave => message.type === "draft-save"));
}

test("production pages never connect to a loopback collaboration worker", () => {
  expect(
    resolveCollaborationWorkerBaseUrl(
      "http://127.0.0.1:8787",
      "generate-memo.pages.dev",
    ),
  ).toBe(DEFAULT_COLLAB_WORKER_URL);
  expect(
    resolveCollaborationWorkerBaseUrl(
      "http://127.0.0.1:8787",
      "127.0.0.1",
    ),
  ).toBe("http://127.0.0.1:8787");
});

test("starting collaboration seeds the fields already filled by the owner", async ({ page }) => {
  await installFakeCollaborationSocket(page);
  await page.goto("http://localhost:3002");
  await page.getByLabel("Nama Project").fill("Draft Seed Kolaborasi");
  await page.getByRole("button", { name: "Start Collab" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await identityDialog.getByLabel("Nama *").fill("Seed Tester");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();

  await expect.poll(() => page.evaluate(() => window.__memoWs.sends
    .filter((message) => message.kind === "text")
    .map((message) => JSON.parse(message.value) as {
      type?: string;
      draft?: { metadata?: { projectName?: string } };
    })
    .find((message) => message.type === "draft-save")
    ?.draft?.metadata?.projectName)).toBe("Draft Seed Kolaborasi");
});

test("collaboration normalizes malformed imported fields before autosave", async ({ page }) => {
  await installFakeCollaborationSocket(page, "", { idleMs: 2_000 });
  await page.goto("http://localhost:3002");
  await page.locator("[data-draft-import-input]").setInputFiles({
    name: "malformed-collaboration-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      id: 42,
      metadata: {
        projectName: 42,
        autoPerihal: "yes",
        accessLinkEnabled: "yes",
      },
      introduction: null,
      referenceEnabled: "yes",
      reference: null,
      developmentRows: [{ id: 42, item: null, description: null }],
      activities: [{
        id: 42,
        startDate: 42,
        endDate: null,
        dates: [null, "2026-08-13"],
        activity: null,
        owner: 42,
      }],
      contacts: [{ id: 42, name: 42, email: null }],
      signers: [{ id: 42, name: 42, title: null }],
      ccRecipients: [{ id: 42, gender: 42, position: null }],
      initials: 42,
      initialsBureau: 42,
      appendixScenarios: [{
        id: 42,
        startDate: 42,
        endDate: null,
        scenario: null,
        expectedResult: null,
        notes: null,
        pic: 42,
      }],
    })),
  });

  await page.getByRole("button", { name: "Start Collab" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await identityDialog.getByLabel("Nama *").fill("Normalizer Tester");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect.poll(async () => (await sentDraftSaves(page)).length).toBeGreaterThan(0);

  const latest = (await sentDraftSaves(page)).at(-1);
  expect(latest).toBeTruthy();
  expect(validateMemoDraftPayload(latest?.draft).ok).toBe(true);
});

test("a rejected autosave retries silently and returns to Saved", async ({ page }) => {
  await installFakeCollaborationSocket(page, "", {
    autosaveMs: 40,
    idleMs: 2_000,
  });
  await startCollaboration(page);
  await expect.poll(async () => (await sentDraftSaves(page)).length).toBeGreaterThan(0);

  const firstSaves = await sentDraftSaves(page);
  const rejectedSave = firstSaves.at(-1);
  expect(rejectedSave?.saveId).toBeTruthy();
  await page.evaluate(({ saveId }) => {
    window.__memoWs.instances.at(-1)?.serverMessage({
      type: "save-error",
      saveId,
      error: "draft_invalid",
    });
  }, { saveId: rejectedSave?.saveId });

  await expect(page.locator("[data-collaboration-error]")).toHaveCount(0);
  await expect(page.getByText("Syncing", { exact: true })).toBeVisible();
  await expect.poll(async () => (await sentDraftSaves(page)).length)
    .toBeGreaterThan(firstSaves.length);

  const retrySave = (await sentDraftSaves(page)).at(-1);
  expect(retrySave?.saveId).not.toBe(rejectedSave?.saveId);
  await page.evaluate(({ staleSaveId, retrySaveId }) => {
    const socket = window.__memoWs.instances.at(-1);
    socket?.serverMessage({
      type: "save-error",
      saveId: staleSaveId,
      error: "draft_invalid",
    });
    socket?.serverMessage({
      type: "saved",
      saveId: retrySaveId,
      updatedAt: Date.now(),
    });
  }, {
    staleSaveId: rejectedSave?.saveId,
    retrySaveId: retrySave?.saveId,
  });

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.locator("[data-collaboration-error]")).toHaveCount(0);
});

test("refreshing a collaboration room restores its snapshot as saved", async ({ page }) => {
  const serverDoc = new Y.Doc();
  const serverMap = serverDoc.getMap("form");
  const updatedAt = Date.now() - 1_000;
  serverMap.set("data", {
    metadata: { projectName: "Draft Room Tersimpan" },
  });
  serverMap.set("updatedAt", updatedAt);
  serverMap.set("updatedBy", "remote-test");
  const serverUpdate = Buffer.from(Y.encodeStateAsUpdate(serverDoc)).toString("base64");

  await installFakeCollaborationSocket(page, serverUpdate);
  await page.goto("http://localhost:3002/?room=refresh-status-room");
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await identityDialog.getByLabel("Nama *").fill("Refresh Tester");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();

  await expect(page.getByLabel("Nama Project")).toHaveValue("Draft Room Tersimpan");
  await expect(page.getByText("Live", { exact: true })).toHaveClass(/bg-emerald/);
  await expect(page.getByText("Saved", { exact: true })).toHaveClass(/bg-emerald/);
});

test("collaboration closes an idle WebSocket without background reconnecting, then resumes on activity", async ({ page }) => {
  await installFakeCollaborationSocket(page);
  const baselineSockets = await startCollaboration(page);

  await expect.poll(() => page.evaluate(() => window.__memoWs.closes.length)).toBe(1);
  await page.waitForTimeout(160);
  await expect(page.evaluate(() => window.__memoWs.instances.length)).resolves.toBe(baselineSockets);

  await page.mouse.move(40, 40);
  await expect.poll(() => page.evaluate(() => window.__memoWs.instances.length)).toBe(baselineSockets + 1);
});

test("the first edit after idle wins over the stale reconnect snapshot", async ({ page }) => {
  const serverDoc = new Y.Doc();
  const serverMap = serverDoc.getMap("form");
  const updatedAt = Date.now() - 1_000;
  serverMap.set("data", {
    metadata: { projectName: "Snapshot Server Lama" },
  });
  serverMap.set("updatedAt", updatedAt);
  serverMap.set("updatedBy", "remote-test");
  serverMap.set(`snapshot:${updatedAt}:remote-test`, {
    metadata: { projectName: "Snapshot Server Lama" },
  });
  const serverUpdate = Buffer.from(Y.encodeStateAsUpdate(serverDoc)).toString("base64");

  await installFakeCollaborationSocket(page, serverUpdate);
  await page.goto("http://localhost:3002");
  await page.getByLabel("Nama Project").fill("Draft Lokal Awal");
  await page.getByRole("button", { name: "Start Collab" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await identityDialog.getByLabel("Nama *").fill("Idle Editor");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByLabel("Nama Project")).toHaveValue("Draft Lokal Awal");
  await expect.poll(() => page.evaluate(() => window.__memoWs.closes.length)).toBeGreaterThan(0);

  await page.getByLabel("Nama Project").fill("Edit Pertama Setelah Idle");

  await expect.poll(() => page.evaluate(() => window.__memoWs.instances.length)).toBeGreaterThan(1);
  await page.waitForTimeout(200);
  await expect(page.getByLabel("Nama Project")).toHaveValue("Edit Pertama Setelah Idle");
});

test("collaboration closes the WebSocket after the hidden-tab grace period", async ({ page }) => {
  await installFakeCollaborationSocket(page);
  const baselineSockets = await startCollaboration(page);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect.poll(() => page.evaluate(() => window.__memoWs.closes.length)).toBe(1);
  await page.waitForTimeout(160);
  await expect(page.evaluate(() => window.__memoWs.instances.length)).resolves.toBe(baselineSockets);
});
