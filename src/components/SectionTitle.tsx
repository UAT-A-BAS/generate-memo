type SectionTitleProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function SectionTitle({ title, description, action }: SectionTitleProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-xs font-normal leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
