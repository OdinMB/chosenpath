import { ReactNode } from "react";
import { FilterConfig, SortConfig } from "./hooks/useTableFilterSort";
import { TableFilterSort, ColumnOption } from "./TableFilterSort";

type SortableTableProps<T> = {
  data: T[];
  columns: ColumnOption<T>[];
  filters: FilterConfig<T>[];
  sortConfig: SortConfig<T> | null;
  onSort: (key: keyof T) => void;
  onFilter: (filter: FilterConfig<T>) => void;
  onRemoveFilter: (key: keyof T) => void;
  onClearFilters: () => void;
  isLoading?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
  renderRow?: (item: T, index: number) => ReactNode;
  keyExtractor?: (item: T) => string;
};

export function SortableTable<T extends { id?: string }>({
  data,
  columns,
  filters,
  sortConfig,
  onSort,
  onFilter,
  onRemoveFilter,
  onClearFilters,
  isLoading = false,
  emptyMessage = "No data available.",
  className = "",
  renderRow,
  keyExtractor = (item) => item.id || String(Math.random()),
}: SortableTableProps<T>) {
  const renderDefaultRow = (item: T) => (
    <tr key={keyExtractor(item)} className="hover:bg-gray-50">
      {columns.map((column) => {
        const columnKey = column.key;
        const value = item[columnKey];
        const tdClassName = column.className || "py-3 px-4";

        return (
          <td
            key={`${keyExtractor(item)}-${String(columnKey)}`}
            className={tdClassName}
          >
            {column.render ? column.render(item) : String(value || "")}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Render only the filter UI above the table */}
      <TableFilterSort
        columns={columns}
        filters={filters}
        sortConfig={sortConfig}
        onSort={onSort}
        onFilter={onFilter}
        onRemoveFilter={onRemoveFilter}
        onClearFilters={onClearFilters}
        renderMode="filters"
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-primary-500">{emptyMessage}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            {/* Render only the table header with sort functionality */}
            <TableFilterSort
              columns={columns}
              filters={[]}
              sortConfig={sortConfig}
              onSort={onSort}
              onFilter={onFilter}
              onRemoveFilter={onRemoveFilter}
              onClearFilters={onClearFilters}
              renderMode="thead"
            />
            <tbody className="divide-y divide-gray-200">
              {renderRow ? data.map(renderRow) : data.map(renderDefaultRow)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
