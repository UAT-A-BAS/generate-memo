import type { MemoMetadata } from "@/types/memo";

export function generatePerihal(metadata: Pick<MemoMetadata, "memoType" | "projectName">) {
  const project = metadata.projectName.trim() || "[Nama Project]";

  switch (metadata.memoType) {
    case "Nasional":
      return `Implementasi ${project}`;
    case "Pilot":
    default:
      return `Pilot Implementasi ${project}`;
  }
}
