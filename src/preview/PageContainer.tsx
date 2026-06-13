import {
  A4_PORTRAIT_HEIGHT_PX,
  A4_PORTRAIT_WIDTH_PX,
} from "@/documentLayout";
import type { PreviewKind, PreviewOrientation } from "@/pagination/paginate";

type PageContainerProps = {
  orientation: PreviewOrientation;
  kind: PreviewKind;
  children: React.ReactNode;
};

export function PageContainer({ orientation, kind, children }: PageContainerProps) {
  const isLandscape = orientation === "landscape";
  const isValidation = kind === "validation";
  const width = isValidation
    ? 794
    : isLandscape
      ? A4_PORTRAIT_HEIGHT_PX
      : A4_PORTRAIT_WIDTH_PX;
  const height = isValidation
    ? 1123
    : isLandscape
      ? A4_PORTRAIT_WIDTH_PX
      : A4_PORTRAIT_HEIGHT_PX;

  return (
    <article
      data-page-kind={kind}
      className="memo-page relative mx-auto overflow-hidden bg-white text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
      style={{
        width,
        minHeight: height,
      }}
    >
      {children}
    </article>
  );
}
