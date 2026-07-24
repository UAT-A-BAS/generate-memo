import { expect, test, type Page } from "@playwright/test";
import * as Y from "yjs";

declare global {
  interface Window {
    __memoWs: {
      closes: string[];
      instances: Array<{ url: string; readyState: number }>;
      sends: Array<{ kind: string; value: string }>;
    };
  }
}

async function installFakeCollaborationSocket(page: Page, serverUpdateBase64 = "") {
  await page.addInitScript((initialServerUpdate) => {
    const NativeWebSocket = window.WebSocket;
    Object.defineProperty(window, "__MEMO_COLLAB_IDLE_TIMERS__", {
      configurable: true,
      value: {
        idleMs: 200,
        hiddenGraceMs: 100,
        autosaveMs: 50,
        reconnectBaseMs: 80,
        reconnectMaxMs: 200,
        idleCloseDelayMs: 0,
      },
    });

    Object.defineProperty(window, "__memoWs", {
      configurable: true,
      value: {
        closes: [] as string[],
        instances: [] as Array<{ url: string; readyState: number }>,
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
  }, serverUpdateBase64);
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
