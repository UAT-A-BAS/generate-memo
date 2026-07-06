import type { ScenarioHeading, ScenarioRow } from "@/types/memo";

export const MAX_SCENARIO_HEADING_DEPTH = 3;

export type ScenarioHierarchyNode = {
  id: string;
  title: string;
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

function alphaIndex(index: number) {
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
    return [{ id: row.sectionGroupId ?? row.id, title: row.section ?? "" }];
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

function applyLabels(nodes: ScenarioHierarchyNode[], parentLabel = "") {
  nodes.forEach((node, index) => {
    node.label = parentLabel
      ? `${parentLabel}.${index + 1}`
      : alphaIndex(index);
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
          depth: index + 1,
          label: "",
          path: path.slice(0, index + 1),
          rows: [],
          children: [],
        };
        siblings.push(node);
      } else if (heading.title !== node.title) {
        node.title = heading.title;
        node.path = path.slice(0, index + 1);
      }
      siblings = node.children;
    });
    node?.rows.push(row);
  });

  applyLabels(root.children);
  return root;
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
