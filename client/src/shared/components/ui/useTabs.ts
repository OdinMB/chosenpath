import { useState, useCallback } from "react";

export function useTabs<T extends string>(defaultTab: T) {
  const [activeTab, setActiveTab] = useState<T>(defaultTab);

  const handleTabChange = useCallback((tab: T) => {
    setActiveTab(tab);
  }, []);

  return {
    activeTab,
    setActiveTab,
    handleTabChange,
  };
}
