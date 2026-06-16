type SectionTitleProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function SectionTitle({ title, action }: SectionTitleProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#c9d3df] pb-3">
      <div>
        <h2 className="text-[1.05rem] font-bold text-[#1c2734]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
