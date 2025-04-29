import { useState, useMemo, useCallback } from "react";

export type SortDirection = "asc" | "desc";

export type SortConfig<T> = {
  key: keyof T;
  direction: SortDirection;
};

export type FilterConfig<T> = {
  key: keyof T;
  value: string;
};

export type TableFilterSortProps<T> = {
  data: T[];
  initialSort?: SortConfig<T>;
  initialFilters?: FilterConfig<T>[];
};

export function useTableFilterSort<T>({
  data,
  initialSort,
  initialFilters = [],
}: TableFilterSortProps<T>) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T> | null>(
    initialSort || null
  );
  const [filters, setFilters] = useState<FilterConfig<T>[]>(initialFilters);

  const requestSort = useCallback(
    (key: keyof T) => {
      let direction: SortDirection = "asc";

      if (
        sortConfig &&
        sortConfig.key === key &&
        sortConfig.direction === "asc"
      ) {
        direction = "desc";
      }

      setSortConfig({ key, direction });
    },
    [sortConfig]
  );

  const addFilter = useCallback((filter: FilterConfig<T>) => {
    setFilters((prevFilters) => {
      // Replace existing filter with same key
      const existingFilterIndex = prevFilters.findIndex(
        (f) => f.key === filter.key
      );

      if (existingFilterIndex >= 0) {
        const newFilters = [...prevFilters];
        newFilters[existingFilterIndex] = filter;
        return newFilters;
      }

      return [...prevFilters, filter];
    });
  }, []);

  const removeFilter = useCallback((key: keyof T) => {
    setFilters((prevFilters) =>
      prevFilters.filter((filter) => filter.key !== key)
    );
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
  }, []);

  const filteredAndSortedData = useMemo(() => {
    // Apply filters
    let result = [...data];

    if (filters.length > 0) {
      result = result.filter((item) => {
        return filters.every((filter) => {
          const itemValue = String(item[filter.key] || "").toLowerCase();
          const filterValue = filter.value.toLowerCase();
          return itemValue.includes(filterValue);
        });
      });
    }

    // Apply sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const valueA = a[sortConfig.key];
        const valueB = b[sortConfig.key];

        if (valueA === valueB) {
          return 0;
        }

        // Handle dates by converting to timestamps
        if (
          typeof valueA === "string" &&
          typeof valueB === "string" &&
          !isNaN(Date.parse(valueA)) &&
          !isNaN(Date.parse(valueB))
        ) {
          const dateA = new Date(valueA).getTime();
          const dateB = new Date(valueB).getTime();
          return sortConfig.direction === "asc" ? dateA - dateB : dateB - dateA;
        }

        // Handle strings, numbers, and booleans
        if (
          (valueA === null || valueA === undefined) &&
          valueB !== null &&
          valueB !== undefined
        ) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }

        if (
          (valueB === null || valueB === undefined) &&
          valueA !== null &&
          valueA !== undefined
        ) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }

        if (typeof valueA === "string" && typeof valueB === "string") {
          return sortConfig.direction === "asc"
            ? valueA.localeCompare(valueB)
            : valueB.localeCompare(valueA);
        }

        // Handle comparisons for number and boolean types
        if (
          (typeof valueA === "number" && typeof valueB === "number") ||
          (typeof valueA === "boolean" && typeof valueB === "boolean")
        ) {
          return sortConfig.direction === "asc"
            ? valueA < valueB
              ? -1
              : 1
            : valueA > valueB
            ? -1
            : 1;
        }

        // For all other cases, convert to string and compare
        return sortConfig.direction === "asc"
          ? String(valueA).localeCompare(String(valueB))
          : String(valueB).localeCompare(String(valueA));
      });
    }

    return result;
  }, [data, filters, sortConfig]);

  return {
    filteredAndSortedData,
    sortConfig,
    filters,
    requestSort,
    addFilter,
    removeFilter,
    clearFilters,
  };
}
