import { useState } from "react";
type TabCategory = "primary" | "secondary" | "tertiary";

type TabItem<T extends string> = {
  id: T;
  label: string;
  // Optional visual category to colorize tabs differently
  category?: TabCategory;
};

type TabsProps<T extends string> = {
  items: TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  variant?: "default" | "underline" | "bordered";
  size?: "sm" | "md" | "lg";
  // When true, render a mobile-friendly select on small screens
  collapseToSelectOnMobile?: boolean;
};

export const Tabs = <T extends string>({
  items,
  activeTab,
  onTabChange,
  variant = "underline",
  size = "md",
  collapseToSelectOnMobile = false,
}: TabsProps<T>) => {
  const [hoveredTab, setHoveredTab] = useState<T | null>(null);
  const getBgClass = (category?: TabCategory) => {
    // Unified background for active and inactive states
    switch (category) {
      case "primary":
        return "bg-secondary-200";
      case "secondary":
        return "bg-secondary-100";
      default:
        return "bg-secondary-50";
    }
  };

  const getIndicatorColorClass = () => "bg-secondary-500";

  const getTabStyles = (category?: TabCategory) => {
    const baseStyles = "font-medium whitespace-nowrap rounded-t-md";
    const sizeStyles = {
      sm: "px-3 py-2 text-sm",
      md: "px-4 py-3 text-sm",
      lg: "px-5 py-4 text-base",
    }[size];

    if (variant === "underline") {
      return `${baseStyles} ${sizeStyles} ${getBgClass(
        category
      )} text-gray-800`;
    }

    if (variant === "bordered") {
      return `${baseStyles} ${sizeStyles} ${getBgClass(
        category
      )} text-gray-800`;
    }

    // Default variant
    return `${baseStyles} ${sizeStyles} ${getBgClass(category)} text-gray-800`;
  };

  const getLegacyTabStyles = (isActive: boolean) => {
    const baseStyles = "font-medium whitespace-nowrap";
    const sizeStyles = {
      sm: "px-3 py-2 text-sm",
      md: "px-4 py-3 text-sm",
      lg: "px-5 py-4 text-base",
    }[size];

    if (variant === "underline") {
      return `${baseStyles} ${sizeStyles} ${
        isActive ? "text-secondary" : "text-gray-500 hover:text-gray-700"
      }`;
    }

    if (variant === "bordered") {
      return `${baseStyles} ${sizeStyles} ${
        isActive ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"
      }`;
    }

    // Default variant
    return `${baseStyles} ${sizeStyles} ${
      isActive
        ? "bg-primary-100 text-primary-800"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    } rounded-md`;
  };

  return (
    <div className="w-full">
      {/* Mobile: show a select dropdown when enabled */}
      {collapseToSelectOnMobile && (
        <div className="md:hidden mt-2 mb-4">
          <select
            aria-label="Tab selector"
            className="block w-full rounded-md border-2 border-secondary-300 bg-white py-2.5 px-3 text-sm font-semibold text-secondary-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary-300 cursor-pointer"
            value={activeTab as string}
            onChange={(e) => onTabChange(e.target.value as T)}
          >
            {items.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav
        className={`flex w-full overflow-x-auto scrollbar-hide ${
          collapseToSelectOnMobile ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex min-w-full md:min-w-0 space-x-1">
          {items.map((tab) => (
            <div key={tab.id} className="relative">
              <button
                type="button"
                className={`$${tab.category ? "" : ""} ${
                  tab.category
                    ? getTabStyles(tab.category)
                    : getLegacyTabStyles(activeTab === tab.id)
                } flex-shrink-0`}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab(null)}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
              {(activeTab === tab.id || hoveredTab === tab.id) && (
                <div
                  className={`absolute bottom-[-1px] left-0 right-0 ${
                    activeTab === tab.id ? "h-[3px]" : "h-[2px]"
                  } ${getIndicatorColorClass()} z-10`}
                />
              )}
            </div>
          ))}
        </div>
      </nav>
      <div
        className={`h-[1px] w-full bg-gray-200 -mt-px ${
          collapseToSelectOnMobile ? "hidden md:block" : ""
        }`}
      ></div>
    </div>
  );
};
