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
  variant?: "default" | "underline" | "bordered" | "submenu";
  size?: "sm" | "md" | "lg";
  // When true, render a mobile-friendly select on small screens
  collapseToSelectOnMobile?: boolean;
  // Optional: choose the breakpoint below which the tabs collapse to a select.
  // Defaults to "md" to preserve existing behavior.
  collapseBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
  // Optional: customize spacing around the collapsed select container
  collapsedSelectSpacingClass?: string;
};

export const Tabs = <T extends string>({
  items,
  activeTab,
  onTabChange,
  variant = "underline",
  size = "md",
  collapseToSelectOnMobile = false,
  collapseBelow = "md",
  collapsedSelectSpacingClass = "mt-2 mb-6",
}: TabsProps<T>) => {
  const [hoveredTab, setHoveredTab] = useState<T | null>(null);

  // Submenu variant: styled like UserAccountHeader, no underline indicator, no collapse
  if (variant === "submenu") {
    return (
      <div className="bg-slate-25 border-b border-slate-200 px-4 py-1 text-sm">
        <div className="container mx-auto">
          <nav className="flex w-full overflow-x-auto scrollbar-hide">
            <div className="flex flex-wrap justify-center items-center gap-x-4 md:gap-x-5 h-auto md:h-8 min-h-[32px] mx-auto">
              {items.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`text-slate-700 hover:text-primary-600 py-1 px-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset rounded transition-all duration-200 ${
                    activeTab === tab.id ? "font-semibold text-primary-700" : ""
                  }`}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>
    );
  }
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
        <div
          className={`${
            {
              sm: "sm:hidden",
              md: "md:hidden",
              lg: "lg:hidden",
              xl: "xl:hidden",
              "2xl": "2xl:hidden",
            }[collapseBelow]
          } ${collapsedSelectSpacingClass}`}
        >
          <select
            aria-label="Select tab to navigate"
            className="block w-full rounded-md border-2 border-secondary-300 bg-white py-2.5 px-3 text-sm font-semibold text-secondary-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-inset cursor-pointer transition-all duration-200"
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
          collapseToSelectOnMobile
            ? {
                sm: "hidden sm:flex",
                md: "hidden md:flex",
                lg: "hidden lg:flex",
                xl: "hidden xl:flex",
                "2xl": "hidden 2xl:flex",
              }[collapseBelow]
            : "flex"
        }`}
      >
        <div className="flex min-w-full md:min-w-0 space-x-1">
          {items.map((tab) => (
            <div key={tab.id} className="relative">
              <button
                type="button"
                className={`${tab.category ? "" : ""} ${
                  tab.category
                    ? getTabStyles(tab.category)
                    : getLegacyTabStyles(activeTab === tab.id)
                } flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-inset focus:z-10 transition-all duration-200 relative ${
                  activeTab === tab.id ? 'z-10' : 'z-0'
                }`}
                onMouseEnter={() => setHoveredTab(tab.id)}
                onMouseLeave={() => setHoveredTab(null)}
                onFocus={() => setHoveredTab(tab.id)}
                onBlur={() => setHoveredTab(null)}
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
          collapseToSelectOnMobile
            ? {
                sm: "hidden sm:block",
                md: "hidden md:block",
                lg: "hidden lg:block",
                xl: "hidden xl:block",
                "2xl": "hidden 2xl:block",
              }[collapseBelow]
            : ""
        }`}
      ></div>
    </div>
  );
};
