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
      return `${baseStyles} ${sizeStyles} border-b-2 ${
        isActive
          ? "border-secondary text-secondary"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`;
    }

    if (variant === "bordered") {
      return `${baseStyles} ${sizeStyles} border-b-2 ${
        isActive
          ? "border-indigo-500 text-indigo-600"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
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
    <div
      className={
        variant === "underline" || variant === "bordered"
          ? "border-b border-gray-200"
          : ""
      }
    >
      <nav
        className={
          variant === "underline" || variant === "bordered"
            ? "-mb-px flex"
            : "flex"
        }
      >
        <div className="flex space-x-1">
          {items.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={getTabStyles(activeTab === tab.id)}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};
