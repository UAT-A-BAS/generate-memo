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

/** Perihal as used inside memo sentences and section titles, without the "Verifikasi" prefix. */
export function perihalBodyText(perihal: string) {
  return perihal.trim().replace(/^verifikasi\s+/i, "");
}
