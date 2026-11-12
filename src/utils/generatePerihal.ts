import type { MemoMetadata } from "@/types/memo";

export function generatePerihal(metadata: Pick<MemoMetadata, "memoType" | "projectName">) {
  const project = metadata.projectName.trim() || "[Nama Project]";

  switch (metadata.memoType) {
    case "Nasional":
      return `Verifikasi Implementasi ${project}`;
    case "Pilot":
    default:
      return `Verifikasi Pilot Implementasi ${project}`;
  }
}

/**
 * Perihal as used inside memo sentences and section titles. The "Verifikasi"
 * prefix is part of the memo wording everywhere, so this only normalizes
 * whitespace; the Perihal field itself already carries the same prefix.
 */
export function perihalBodyText(perihal: string) {
  return perihal.trim().replace(/\s+/g, " ");
}
