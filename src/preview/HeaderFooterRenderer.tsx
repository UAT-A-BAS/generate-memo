type HeaderFooterRendererProps = {
  pageNumber: number;
  totalPages: number;
};

export function HeaderFooterRenderer({
  pageNumber,
  totalPages,
}: HeaderFooterRendererProps) {
  return (
    <>
      <header className="absolute left-24 top-14 grid text-[12px] leading-[1.05] text-[#b7b7b7]">
        <span>[No Memo]</span>
        <span>[Tanggal Rilis]</span>
      </header>
      <footer className="absolute bottom-8 right-20 text-[13px] text-[#7d7d7d]">
        {pageNumber} / {totalPages}
      </footer>
    </>
  );
}
