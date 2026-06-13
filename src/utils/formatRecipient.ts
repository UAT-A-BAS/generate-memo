import type { Recipient } from "@/types/memo";

export function formatRecipientAttention(recipient: Recipient) {
  const name = recipient.name?.trim();
  if (!name) return "";

  return ["U.p.", "Yth.", recipient.gender.trim(), name]
    .filter(Boolean)
    .join(" ");
}
