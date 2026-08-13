export const BODY_COLUMN_INDENT = 2100;
export const BODY_COLUMN_RIGHT_INDENT = 0;
export const VISIBLE_TABLE_RIGHT_INSET = 86;
export const BODY_TITLE_WIDTH = 1800;
export const BODY_COLUMN_GAP = BODY_COLUMN_INDENT - BODY_TITLE_WIDTH;
export const CONTINUATION_RULE_INDENT = BODY_COLUMN_INDENT;
export const WORD_LINE_MULTIPLE_108 = 259;
export const WORD_LINE_MULTIPLE_115 = 276;
export const WORD_INDENT_002_CM = 11;

export const A4_PORTRAIT_WIDTH_PX = (210 / 25.4) * 96;
export const A4_PORTRAIT_HEIGHT_PX = (297 / 25.4) * 96;
export const A4_WIDTH_TWIPS = 11906;
export const A4_HEIGHT_TWIPS = 16838;
export const MAIN_PAGE_MARGINS = {
  top: 960,
  right: 1200,
  bottom: 960,
  left: 1440,
  header: 840,
  footer: 480,
} as const;
export const APPENDIX_PAGE_MARGINS = {
  top: 1500,
  right: 840,
  bottom: 960,
  left: 600,
  header: 840,
  footer: 480,
} as const;

export const MAIN_PAGE_CONTENT_WIDTH =
  A4_WIDTH_TWIPS - MAIN_PAGE_MARGINS.left - MAIN_PAGE_MARGINS.right;
export const MAIN_BODY_CONTENT_WIDTH =
  MAIN_PAGE_CONTENT_WIDTH - BODY_COLUMN_INDENT - BODY_COLUMN_RIGHT_INDENT;
export const MAIN_BODY_TABLE_WIDTH =
  MAIN_BODY_CONTENT_WIDTH - VISIBLE_TABLE_RIGHT_INSET;
export const APPENDIX_PAGE_CONTENT_WIDTH =
  A4_HEIGHT_TWIPS - APPENDIX_PAGE_MARGINS.left - APPENDIX_PAGE_MARGINS.right;
export const APPENDIX_TABLE_WIDTH =
  APPENDIX_PAGE_CONTENT_WIDTH - VISIBLE_TABLE_RIGHT_INSET;

export const APPENDIX_COLUMN_WIDTHS = [5, 42, 42, 11] as const;
export const APPENDIX_HEADER_FILL = "D9D9D9";
export const TABLE_HEADER_FILL = APPENDIX_HEADER_FILL;
export const DEVELOPMENT_COLUMN_WIDTHS = [8, 24, 68] as const;
export const DEVELOPMENT_SINGLE_COLUMN_WIDTHS = [28, 72] as const;
export const ACTIVITY_COLUMN_WIDTHS = [56, 22, 22] as const;
export const ACTIVITY_NUMBERED_COLUMN_WIDTHS = [8, 48, 21, 23] as const;

const TABLE_BODY_FONT_SIZE_POINTS = 11;
const TABLE_CELL_HORIZONTAL_MARGIN_POINTS = 9;
const TABLE_WORD_FIT_SAFETY_POINTS = 2;
const MAX_DEVELOPMENT_ITEM_WIDTH = 38;
const MAX_SINGLE_DEVELOPMENT_ITEM_WIDTH = 42;

function estimatedTimesNewRomanWidthEm(word: string) {
  return Array.from(word.slice(0, 28)).reduce((width, character) => {
    if (/[WM]/.test(character)) return width + 0.92;
    if (/[mw]/.test(character)) return width + 0.78;
    if (character === "P") return width + 0.61;
    if (/[A-Z]/.test(character)) return width + 0.67;
    if (/[ilIjtfr.,'`:;|!]/.test(character)) return width + 0.28;
    if (/[rs]/.test(character)) return width + 0.36;
    if (/[aceovxyz]/.test(character)) return width + 0.44;
    return width + 0.5;
  }, 0);
}

function longestWordWidthEm(values: string[]) {
  return values.reduce((longest, value) => {
    const words = value.match(/\S+/g) ?? [];
    return Math.max(
      longest,
      ...words.map(estimatedTimesNewRomanWidthEm),
    );
  }, estimatedTimesNewRomanWidthEm("Pengembangan"));
}

/**
 * Keeps normal words intact by borrowing only the width needed from the
 * description column. The estimate uses the same 11 pt Times New Roman and
 * cell margins as the DOCX table, so preview and export share one geometry.
 */
export function fittedDevelopmentColumnWidths(
  itemTexts: string[],
  numbered: boolean,
) {
  const base: number[] = numbered
    ? [...DEVELOPMENT_COLUMN_WIDTHS]
    : [...DEVELOPMENT_SINGLE_COLUMN_WIDTHS];
  const itemIndex = numbered ? 1 : 0;
  const descriptionIndex = itemIndex + 1;
  const requiredPoints =
    longestWordWidthEm(itemTexts) * TABLE_BODY_FONT_SIZE_POINTS +
    TABLE_CELL_HORIZONTAL_MARGIN_POINTS +
    TABLE_WORD_FIT_SAFETY_POINTS;
  const requiredPercent = Math.ceil(
    (requiredPoints * 20 * 100) / MAIN_BODY_TABLE_WIDTH,
  );
  const maximumItemWidth = numbered
    ? MAX_DEVELOPMENT_ITEM_WIDTH
    : MAX_SINGLE_DEVELOPMENT_ITEM_WIDTH;
  const fittedItemWidth = Math.min(
    maximumItemWidth,
    Math.max(base[itemIndex], requiredPercent),
  );
  const borrowedWidth = fittedItemWidth - base[itemIndex];

  base[itemIndex] = fittedItemWidth;
  base[descriptionIndex] -= borrowedWidth;
  return base;
}

export function developmentColumnWidthsTwips(
  itemTexts: string[],
  numbered: boolean,
) {
  const percentages = fittedDevelopmentColumnWidths(itemTexts, numbered);
  if (numbered) {
    const baseWidths = [570, 1695, 4815];
    const borrowedWidth = Math.round(
      (MAIN_BODY_TABLE_WIDTH *
        (percentages[1] - DEVELOPMENT_COLUMN_WIDTHS[1])) /
        100,
    );
    return [
      baseWidths[0],
      baseWidths[1] + borrowedWidth,
      baseWidths[2] - borrowedWidth,
    ];
  }

  const widths = percentages.map((width) =>
    Math.round((MAIN_BODY_TABLE_WIDTH * width) / 100),
  );
  widths[widths.length - 1] +=
    MAIN_BODY_TABLE_WIDTH - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}
