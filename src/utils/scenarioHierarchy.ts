import type { ScenarioHeading, ScenarioRow } from "@/types/memo";

export const MAX_SCENARIO_HEADING_DEPTH = 3;

export type ScenarioHierarchyNode = {
  id: string;
  title: string;
  code?: string;
  depth: number;
  label: string;
  path: ScenarioHeading[];
  rows: ScenarioRow[];
  children: ScenarioHierarchyNode[];
};

export type ScenarioHierarchy = {
  rows: ScenarioRow[];
  children: ScenarioHierarchyNode[];
};

export function alphaIndex(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function cleanHeading(value: unknown): ScenarioHeading | null {
  if (!value || typeof value !== "object") return null;
  const heading = value as Partial<ScenarioHeading>;
  if (typeof heading.id !== "string" || !heading.id.trim()) return null;
  return {
    id: heading.id,
    title: typeof heading.title === "string" ? heading.title : "",
    code: typeof heading.code === "string" ? heading.code : undefined,
  };
}

export function scenarioHeadingPath(row: ScenarioRow): ScenarioHeading[] {
  if (Array.isArray(row.headingPath)) {
    return row.headingPath
      .map(cleanHeading)
      .filter((heading): heading is ScenarioHeading => Boolean(heading))
      .slice(0, MAX_SCENARIO_HEADING_DEPTH);
  }

  if (row.sectionGroupId || row.section) {
    return [{ id: row.sectionGroupId ?? row.id, title: row.section ?? "", code: undefined }];
  }

  return [];
}

export function withScenarioHeadingPath(
  row: ScenarioRow,
  headingPath: ScenarioHeading[],
): ScenarioRow {
  const path = headingPath.slice(0, MAX_SCENARIO_HEADING_DEPTH);
  return {
    ...row,
    headingPath: path,
    sectionGroupId: path[0]?.id,
    section: path[0]?.title ?? "",
  };
}

// Editing one heading letter must re-base everything underneath it. The edited
// heading keeps the new code (or returns to auto numbering when cleared) and
// every descendant drops its own code, so its label re-derives from the new
// parent (B -> B.1 -> B.1.1) instead of keeping a stale imported chain.
export function setScenarioHeadingCode(
  rows: ScenarioRow[],
  headingId: string,
  code: string | null,
): ScenarioRow[] {
  let changed = false;
  const nextRows = rows.map((row) => {
    const path = scenarioHeadingPath(row);
    const index = path.findIndex((heading) => heading.id === headingId);
    if (index === -1) return row;
    changed = true;
    const nextPath = path.map((heading, position) => {
      if (position < index) return heading;
      if (position === index) {
        return code ? { ...heading, code } : { id: heading.id, title: heading.title };
      }
      return { id: heading.id, title: heading.title };
    });
    return withScenarioHeadingPath(row, nextPath);
  });
  return changed ? nextRows : rows;
}

// Accepts "b", "B.", "B.1" or a bare "3" for nested headings and returns the
// label the memo tables print, so the letter box and the output always agree.
export function normalizeScenarioHeadingCode(value: string, parentLabel?: string) {
  const normalized = value.replace(/\s+/g, "").replace(/\.+$/, "").toUpperCase();
  if (!normalized) return "";
  if (parentLabel && !normalized.includes(".")) return `${parentLabel}.${normalized}`;
  return normalized;
}

function applyLabels(nodes: ScenarioHierarchyNode[], parentLabel = "") {
  nodes.forEach((node, index) => {
    node.label = node.code ?? (
      parentLabel
        ? `${parentLabel}.${index + 1}`
        : alphaIndex(index)
    );
    applyLabels(node.children, node.label);
  });
}

export function buildScenarioHierarchy(rows: ScenarioRow[]): ScenarioHierarchy {
  const root: ScenarioHierarchy = { rows: [], children: [] };

  rows.forEach((row) => {
    const path = scenarioHeadingPath(row);
    if (!path.length) {
      root.rows.push(row);
      return;
    }

    let siblings = root.children;
    let node: ScenarioHierarchyNode | undefined;
    path.forEach((heading, index) => {
      node = siblings.find((candidate) => candidate.id === heading.id);
      if (!node) {
        node = {
          id: heading.id,
          title: heading.title,
          code: heading.code,
          depth: index + 1,
          label: "",
          path: path.slice(0, index + 1),
          rows: [],
          children: [],
        };
        siblings.push(node);
      } else {
        if (heading.title !== node.title) node.title = heading.title;
        if (heading.code && heading.code !== node.code) node.code = heading.code;
        node.path = path.slice(0, index + 1);
      }
      siblings = node.children;
    });
    node?.rows.push(row);
  });

  applyLabels(root.children);
  return root;
}

export function singleRootIsInactive(hierarchy: ScenarioHierarchy): boolean {
  if (hierarchy.children.length !== 1) return false;
  const root = hierarchy.children[0];
  const editable =
    root.rows.some((row) => row.sectionTitleEditable === true) ||
    root.children.length > 0;
  return !editable;
}

// Single source of truth for scenario section/subsection letter labels. Both the
// editor inputs and the preview/DOCX table must read from this so they stay in
// sync, including the "reset letter per date" option. When reset-per-date is off
// the letter keeps advancing across dates; a lone inactive section is treated as
// no section at all so the next date still starts at "A".
export function computeScenarioLabels(
  rows: ScenarioRow[],
  resetPerDate: boolean,
): Map<string, string> {
  const labels = new Map<string, string>();
  const groups = new Map<string, ScenarioRow[]>();
  const order: string[] = [];

  rows.forEach((row) => {
    const dateId = row.dateGroupId ?? row.id;
    if (!groups.has(dateId)) {
      groups.set(dateId, []);
      order.push(dateId);
    }
    groups.get(dateId)!.push(row);
  });

  let runningRootOffset = 0;
  order.forEach((dateId) => {
    const hierarchy = buildScenarioHierarchy(groups.get(dateId)!);
    const roots = hierarchy.children;
    const inactive = singleRootIsInactive(hierarchy);
    const activeRootCount = inactive ? 0 : roots.length;
    const rootOffset = resetPerDate ? 0 : runningRootOffset;

    const visit = (nodes: ScenarioHierarchyNode[], parentLabel = "") => {
      const isRoot = parentLabel === "";
      nodes.forEach((node, index) => {
        const autoLabel = isRoot
          ? alphaIndex(rootOffset + index)
          : `${parentLabel}.${index + 1}`;
        const label = node.code || autoLabel;
        labels.set(node.id, label);
        visit(node.children, label);
      });
    };
    visit(roots, "");
    runningRootOffset += activeRootCount;
  });

  return labels;
}

export function flattenScenarioHierarchy(hierarchy: ScenarioHierarchy): ScenarioRow[] {
  const flattenNodes = (nodes: ScenarioHierarchyNode[]): ScenarioRow[] =>
    nodes.flatMap((node) => [
      ...node.rows,
      ...flattenNodes(node.children),
    ]);

  return [...hierarchy.rows, ...flattenNodes(hierarchy.children)];
}

export function scenarioHierarchyDepth(rows: ScenarioRow[]) {
  return rows.reduce(
    (depth, row) => Math.max(depth, scenarioHeadingPath(row).length),
    0,
  );
}

export function scenarioHeadingName(depth: number) {
  if (depth === 1) return "Bagian";
  if (depth === 2) return "Subbagian";
  return "Sub-subbagian";
}
