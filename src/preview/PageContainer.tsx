import type { PreviewOrientation } from "@/pagination/paginate";

type PageContainerProps = {
  orientation: PreviewOrientation;
  children: React.ReactNode;
};

export function PageContainer({ orientation, children }: PageContainerProps) {
  const isLandscape = orientation === "landscape";

  return (
    <article
      className="memo-page relative mx-auto overflow-hidden bg-white text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
      style={{
        width: isLandscape ? 1123 : 794,
        minHeight: isLandscape ? 794 : 1123,
      }}
    >
      {children}
    </article>
  );
}

