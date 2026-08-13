const POWER_APPS_SOURCE = "powerapps";
const POWER_APPS_ROOM_PREFIX = "m365_";
const POWER_APPS_USER_COLOR = "#0A67B1";

export const DEFAULT_POWER_APPS_PORTAL_URL =
  "https://apps.powerapps.com/play/e/Default-59daf140-4aee-4b77-80f4-4ea8bec86c2e/a/b24919b7-b1b0-4cd1-9fe0-55342102130a";

const CONFIGURED_POWER_APPS_PORTAL_URL =
  process.env.NEXT_PUBLIC_POWER_APPS_PORTAL_URL ?? DEFAULT_POWER_APPS_PORTAL_URL;

const ENTRA_OBJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PowerAppsLaunchContext = {
  kind: "powerapps";
  name: string;
  objectId: string;
  userId: string;
  color: string;
};

function cleanDisplayName(value: string | null) {
  if (!value) return "";
  const cleanName = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleanName.slice(0, 120);
}

export function powerAppsLaunchContextFromUrl(
  input: string | URL,
): PowerAppsLaunchContext | null {
  const url = input instanceof URL ? input : new URL(input);
  if (url.searchParams.get("source")?.toLowerCase() !== POWER_APPS_SOURCE) return null;

  const name = cleanDisplayName(url.searchParams.get("pa_name"));
  const objectId = (url.searchParams.get("pa_oid") ?? "").trim().toLowerCase();
  if (!name || !ENTRA_OBJECT_ID_PATTERN.test(objectId)) return null;

  return {
    kind: "powerapps",
    name,
    objectId,
    userId: `m365:${objectId}`,
    color: POWER_APPS_USER_COLOR,
  };
}

export function isPowerAppsRoomId(roomId: string) {
  return new RegExp(`^${POWER_APPS_ROOM_PREFIX}[0-9a-f]{16}$`, "i").test(roomId.trim());
}

export function powerAppsRoomId(randomId: string) {
  return `${POWER_APPS_ROOM_PREFIX}${randomId}`;
}

export function powerAppsPortalRoomLink(roomId: string) {
  const url = new URL(CONFIGURED_POWER_APPS_PORTAL_URL);
  url.searchParams.set("room", roomId.trim());
  return url.toString();
}
