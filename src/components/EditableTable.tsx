type EditableColumn<T> = {
  key: string;
  header: string;
  width?: string;
  render: (row: T, index: number) => React.ReactNode;
};

type EditableTableProps<T> = {
  rows: T[];
  columns: EditableColumn<T>[];
  getRowKey: (row: T) => string;
  emptyText?: string;
};

export function EditableTable<T>({
  rows,
  columns,
  getRowKey,
  emptyText = "Belum ada data.",
}: EditableTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="border-b border-slate-200 px-3 py-2" style={{ width: column.width }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={getRowKey(row)} className="align-top">
                {columns.map((column) => (
                  <td key={column.key} className="border-b border-slate-100 px-3 py-3">
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-slate-500">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

