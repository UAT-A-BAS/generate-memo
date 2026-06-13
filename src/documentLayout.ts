export const BODY_COLUMN_INDENT = 2100;
export const BODY_COLUMN_RIGHT_INDENT = 350;
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

export const APPENDIX_COLUMN_WIDTHS = [5, 42, 42, 11] as const;
export const APPENDIX_HEADER_FILL = "D9D9D9";
export const TABLE_HEADER_FILL = APPENDIX_HEADER_FILL;
export const DEVELOPMENT_COLUMN_WIDTHS = [8, 24, 68] as const;
export const DEVELOPMENT_SINGLE_COLUMN_WIDTHS = [28, 72] as const;
export const ACTIVITY_COLUMN_WIDTHS = [56, 22, 22] as const;
export const ACTIVITY_NUMBERED_COLUMN_WIDTHS = [8, 48, 21, 23] as const;
