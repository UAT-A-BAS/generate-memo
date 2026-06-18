import type { Recipient } from "@/types/memo";

export function formatRecipientAttention(recipient: Recipient) {
  const name = recipient.name?.trim();
  if (!name) return "";
  const salutation = recipient.gender.trim() === "Yth." ? "" : recipient.gender.trim();

  return ["U.p.", "Yth.", salutation, name]
    .filter(Boolean)
    .join(" ");
}
