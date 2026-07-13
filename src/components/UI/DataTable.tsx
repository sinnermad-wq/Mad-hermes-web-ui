import './DataTable.css';

export interface Column<R> {
  key: string;
  header: string;
  render: (row: R) => React.ReactNode;
  numeric?: boolean;
  width?: string;
}

interface DataTableProps<R> {
  rows: R[];
  columns: Column<R>[];
  emptyHint?: string;
}

export function DataTable<R>({ rows, columns, emptyHint }: DataTableProps<R>) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={c.numeric ? 'num' : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="muted" style={{ padding: 'var(--space-6)' }}>
                {emptyHint ?? 'No rows.'}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
