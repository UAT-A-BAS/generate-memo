type HeaderFooterRendererProps = {
  pageNumber: number;
  totalPages: number;
  kind?: "main" | "appendix" | "validation";
};

export function HeaderFooterRenderer({
  pageNumber,
  totalPages,
  kind = "main",
}: HeaderFooterRendererProps) {
  const isAppendix = kind === "appendix";
  return (
    <>
      <header className={`absolute ${isAppendix ? "left-10" : "left-24"} top-14 grid text-[14.67px] leading-[1.05] text-[#b7b7b7]`}>
        <span>[No Memo]</span>
        <span>[Tanggal Rilis]</span>
      </header>
      <footer className="absolute bottom-8 right-20 text-[14.67px] text-[#7d7d7d]">
        {pageNumber} / {totalPages}
      </footer>
    </>
  );
}
