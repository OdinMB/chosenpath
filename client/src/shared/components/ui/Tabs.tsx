type TabItem<T extends string> = {
  id: T;
  label: string;
};

type TabsProps<T extends string> = {
  items: TabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  variant?: "default" | "underline" | "bordered";
  size?: "sm" | "md" | "lg";
};

export const Tabs = <T extends string>({
  items,
  activeTab,
  onTabChange,
  variant = "underline",
  size = "md",
}: TabsProps<T>) => {
  const getTabStyles = (isActive: boolean) => {
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
      <nav className="flex w-full overflow-x-auto scrollbar-hide">
        <div className="flex min-w-full md:min-w-0 space-x-1">
          {items.map((tab) => (
            <div key={tab.id} className="relative">
              <button
                type="button"
                className={`${getTabStyles(
                  activeTab === tab.id
                )} flex-shrink-0`}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
              {activeTab === tab.id && (
                <div
                  className={`absolute bottom-[-1px] left-0 right-0 h-[3px] ${
                    variant === "bordered" ? "bg-indigo-500" : "bg-secondary"
                  } z-10`}
                />
              )}
            </div>
          ))}
        </div>
      </nav>
      <div className="h-[1px] w-full bg-gray-200 -mt-px"></div>
    </div>
  );
};
