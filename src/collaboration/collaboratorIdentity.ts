import { createId } from "@/utils/ids";

export type CollaboratorIdentity = {
  id: string;
  name: string;
  color: string;
};

const PROFILE_KEY = "memo-builder:user-profile";
const COLORS = ["#0A67B1", "#18735C", "#7C3AED", "#B45309", "#BE123C"];

function isGeneratedLegacyName(name: string) {
  return /^Reviewer \d{3}$/.test(name.trim());
}

export function getStoredCollaboratorIdentity(): CollaboratorIdentity | null {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(PROFILE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<CollaboratorIdentity>;
    if (
      parsed.id &&
      parsed.name?.trim() &&
      parsed.color &&
      !isGeneratedLegacyName(parsed.name)
    ) {
      return {
        id: parsed.id,
        name: parsed.name.trim(),
        color: parsed.color,
      };
    }
  } catch {
    // Invalid legacy profiles are replaced when the user enters a name.
  }

  window.localStorage.removeItem(PROFILE_KEY);
  return null;
}

export function saveCollaboratorIdentity(name: string): CollaboratorIdentity {
  const cleanName = name.trim();
  const existing = getStoredCollaboratorIdentity();
  const identity = {
    id: existing?.id ?? createId("memo-user"),
    name: cleanName,
    color: existing?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)],
  };

  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(identity));
  return identity;
}
