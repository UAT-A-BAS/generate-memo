export type ConsecutiveMergeState = {
  hidden: boolean;
  span: number;
};

function normalizedMergeKey(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function consecutiveMergeState<T>(
  rows: T[],
  index: number,
  value: (row: T) => string,
  startsGroup: (row: T, index: number) => boolean = () => false,
): ConsecutiveMergeState {
  const currentKey = normalizedMergeKey(value(rows[index]));
  if (!currentKey) return { hidden: false, span: 1 };

  if (
    index > 0 &&
    !startsGroup(rows[index], index) &&
    normalizedMergeKey(value(rows[index - 1])) === currentKey
  ) {
    return { hidden: true, span: 0 };
  }

  let span = 1;
  for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
    if (startsGroup(rows[cursor], cursor)) break;
    if (normalizedMergeKey(value(rows[cursor])) !== currentKey) break;
    span += 1;
  }

  return { hidden: false, span };
}
