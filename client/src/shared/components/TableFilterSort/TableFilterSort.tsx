import { useState, ReactNode } from "react";
import { FilterConfig, SortConfig } from "./hooks/useTableFilterSort";
import { Icons, Select } from "../ui";

export type ColumnOption<T> = {
  key: keyof T;
  label: string;
  filterable?: boolean;
  sortable?: boolean;
  className?: string;
  render?: (item: T) => ReactNode;
};

// Define rendering modes for the component
export type RenderMode = "filters" | "thead" | "both";

export type SelectionAction<T> = {
  label: string;
  icon?: ReactNode;
  onClick: (selectedItems: T[]) => void;
  disabled?: (selectedItems: T[]) => boolean;
};

type TableFilterSortComponentProps<T> = {
  columns: ColumnOption<T>[];
  filters: FilterConfig<T>[];
  sortConfig: SortConfig<T> | null;
  onSort: (key: keyof T) => void;
  onFilter: (filter: FilterConfig<T>) => void;
  onRemoveFilter: (key: keyof T) => void;
  onClearFilters: () => void;
  renderMode?: RenderMode;
  // Selection props
  enableSelection?: boolean;
  selectedItems?: Set<string>;
  onToggleAllSelection?: (visibleItems: T[]) => void;
  visibleItems?: T[];
  keyExtractor?: (item: T) => string;
  selectionActions?: SelectionAction<T>[];
  getSelectedItems?: (allItems: T[]) => T[];
  allItems?: T[];
};

export function TableFilterSort<T extends { id?: string }>({
  columns,
  filters,
  sortConfig,
  onSort,
  onFilter,
  onRemoveFilter,
  onClearFilters,
  renderMode = "both",
  enableSelection = false,
  selectedItems = new Set(),
  onToggleAllSelection,
  visibleItems = [],
  keyExtractor = (item: T) => item.id || String(Math.random()),
  selectionActions = [],
  getSelectedItems,
  allItems = [],
}: TableFilterSortComponentProps<T>) {
  const [filterKey, setFilterKey] = useState<keyof T | "">("");
  const [filterValue, setFilterValue] = useState("");

  const filterableColumns = columns.filter((col) => col.filterable !== false);

  const handleFilterKeyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterKey(e.target.value as keyof T);
  };

  const handleFilterValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterValue(e.target.value);
  };

  const handleAddFilter = () => {
    if (filterKey && filterValue) {
      onFilter({ key: filterKey as keyof T, value: filterValue });
      setFilterValue("");
    }
  };

  const getColumnLabel = (key: keyof T) => {
    const column = columns.find((col) => col.key === key);
    return column ? column.label : String(key);
  };

  // Helper function to render sort indicator
  const renderSortIndicator = (columnKey: keyof T) => {
    if (sortConfig && sortConfig.key === columnKey) {
      return (
        <Icons.ChevronUp
          className={`inline-block ml-1 h-4 w-4 transition-transform ${
            sortConfig.direction === "desc" ? "rotate-180" : ""
          }`}
        />
      );
    }
    return null;
  };

  // Check if all visible items are selected
  const allVisibleSelected =
    enableSelection &&
    visibleItems.length > 0 &&
    visibleItems.every((item) => selectedItems.has(keyExtractor(item)));

  // Check if some (but not all) visible items are selected
  const someVisibleSelected =
    enableSelection &&
    visibleItems.length > 0 &&
    visibleItems.some((item) => selectedItems.has(keyExtractor(item))) &&
    !allVisibleSelected;

  // Get currently selected items for actions
  const currentlySelectedItems = getSelectedItems
    ? getSelectedItems(allItems)
    : [];

  // Determine if we should render the filter UI based on renderMode
  const shouldRenderFilterUI =
    (renderMode === "filters" || renderMode === "both") &&
    (filters.length > 0 ||
      filterableColumns.length > 0 ||
      (enableSelection && selectionActions.length > 0));

  // Determine if we should render the sort UI based on renderMode
  const shouldRenderSortUI =
    (renderMode === "thead" || renderMode === "both") && sortConfig !== null;

  return (
    <>
      {shouldRenderFilterUI && (
        <div className="bg-white p-3 mb-4">
          <div className="flex flex-col md:flex-row md:justify-between gap-4">
            {/* Filter Controls */}
            {filterableColumns.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center">
                  <div className="mr-2">
                    <Select
                      value={String(filterKey)}
                      onChange={handleFilterKeyChange}
                      placeholder="Filter by..."
                      size="sm"
                    >
                      <option value="">Filter by...</option>
                      {filterableColumns.map((column) => (
                        <option
                          key={String(column.key)}
                          value={String(column.key)}
                        >
                          {column.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <input
                    type="text"
                    value={filterValue}
                    onChange={handleFilterValueChange}
                    placeholder="Filter value..."
                    className="mr-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm p-1"
                    disabled={!filterKey}
                  />

                  <button
                    onClick={handleAddFilter}
                    disabled={!filterKey || !filterValue}
                    className="inline-flex items-center px-3 py-1 text-sm rounded bg-secondary text-white hover:bg-secondary-700 disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    <Icons.Plus className="mr-1 h-3 w-3" />
                    Add
                  </button>
                </div>

                {filters.length > 0 && (
                  <button
                    onClick={onClearFilters}
                    className="inline-flex items-center px-2 py-1 text-xs rounded border border-gray-300 text-tertiary hover:bg-tertiary-50"
                  >
                    <Icons.Close className="mr-1 h-3 w-3" />
                    Clear All
                  </button>
                )}
              </div>
            )}

            {/* Selection Actions */}
            {enableSelection && selectionActions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {currentlySelectedItems.length > 0 && (
                  <span className="text-sm text-gray-600 mr-2">
                    {currentlySelectedItems.length} selected
                  </span>
                )}
                {selectionActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => action.onClick(currentlySelectedItems)}
                    disabled={
                      action.disabled
                        ? action.disabled(currentlySelectedItems)
                        : currentlySelectedItems.length === 0
                    }
                    className="inline-flex items-center px-3 py-1 text-sm rounded bg-secondary text-white hover:bg-secondary-700 disabled:bg-gray-300 disabled:text-gray-500"
                  >
                    {action.icon && <span className="mr-1">{action.icon}</span>}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active Filters Display */}
          {filters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-500">
                Active Filters:
              </span>
              {filters.map((filter) => (
                <div
                  key={String(filter.key)}
                  className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-gray-100"
                >
                  <span className="font-medium mr-1">
                    {getColumnLabel(filter.key)}:
                  </span>
                  <span>{filter.value}</span>
                  <button
                    onClick={() => onRemoveFilter(filter.key)}
                    className="ml-1 text-gray-500 hover:text-tertiary"
                  >
                    <Icons.Close className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Only render the table header if sortConfig is provided */}
      {shouldRenderSortUI && (
        <thead className="bg-gray-100 text-primary-800">
          <tr>
            {/* Selection checkbox column */}
            {enableSelection && (
              <th className="py-3 px-4 text-left w-12">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someVisibleSelected;
                  }}
                  onChange={() =>
                    onToggleAllSelection && onToggleAllSelection(visibleItems)
                  }
                  className="rounded border-gray-300 text-secondary focus:ring-secondary"
                />
              </th>
            )}
            {columns.map((column) => {
              const baseClassName = column.className || "py-3 px-4 text-left";
              const isSortable = column.sortable !== false;
              const className = `${baseClassName} ${
                isSortable ? "cursor-pointer hover:bg-gray-200" : ""
              }`;

              return (
                <th
                  key={String(column.key)}
                  className={className}
                  onClick={() => (isSortable ? onSort(column.key) : null)}
                >
                  <div className="flex items-center">
                    {column.label}
                    {isSortable && renderSortIndicator(column.key)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
      )}
    </>
  );
}
