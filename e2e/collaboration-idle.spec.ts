import { expect, test, type Page } from "@playwright/test";

async function installFakeCollaborationSocket(page: Page) {
  await page.addInitScript(() => {
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
          this.dispatchEvent(new MessageEvent("message", {
            data: new Uint8Array([0, 0]).buffer,
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

    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      value: FakeWebSocket,
    });
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

test("collaboration closes an idle WebSocket without background reconnecting, then resumes on activity", async ({ page }) => {
  await installFakeCollaborationSocket(page);
  const baselineSockets = await startCollaboration(page);

  await expect.poll(() => page.evaluate(() => window.__memoWs.closes.length)).toBe(1);
  await page.waitForTimeout(160);
  await expect(page.evaluate(() => window.__memoWs.instances.length)).resolves.toBe(baselineSockets);

  await page.mouse.move(40, 40);
  await expect.poll(() => page.evaluate(() => window.__memoWs.instances.length)).toBe(baselineSockets + 1);
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
