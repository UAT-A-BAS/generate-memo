type SectionTitleProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function SectionTitle({ title, action }: SectionTitleProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-900">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
