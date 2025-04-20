import React from "react";
import { Tabs } from "./Tabs";
import { useTabs } from "./useTabs";

// Example using strongly typed tabs
type ExampleTab = "first" | "second" | "third";

export const TabsExample: React.FC = () => {
  const { activeTab, handleTabChange } = useTabs<ExampleTab>("first");

  const tabItems = [
    { id: "first" as ExampleTab, label: "First Tab" },
    { id: "second" as ExampleTab, label: "Second Tab" },
    { id: "third" as ExampleTab, label: "Third Tab" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium mb-2">Default Tabs</h3>
        <Tabs
          items={tabItems}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="default"
        />
        <div className="p-4 mt-2 bg-gray-50 rounded">
          Content for: {activeTab}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-2">Underline Tabs</h3>
        <Tabs
          items={tabItems}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="underline"
          size="sm"
        />
        <div className="p-4 mt-2 bg-gray-50 rounded">
          Content for: {activeTab}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-2">Bordered Tabs</h3>
        <Tabs
          items={tabItems}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          variant="bordered"
          size="lg"
        />
        <div className="p-4 mt-2 bg-gray-50 rounded">
          Content for: {activeTab}
        </div>
      </div>
    </div>
  );
};
