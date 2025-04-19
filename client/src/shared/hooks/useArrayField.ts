import { useState } from "react";

interface UseArrayFieldProps {
  initialItems: string[];
  onChange?: (items: string[]) => void;
  readOnly?: boolean;
}

export function useArrayField({
  initialItems,
  onChange,
  readOnly = false,
}: UseArrayFieldProps) {
  const [items, setItems] = useState<string[]>(initialItems);

  const handleAddItem = () => {
    if (readOnly) return;

    const updatedItems = [...items, ""];
    setItems(updatedItems);
    onChange?.(updatedItems);
  };

  const handleUpdateItem = (index: number, value: string) => {
    if (readOnly) return;

    const updatedItems = [...items];
    updatedItems[index] = value;
    setItems(updatedItems);
    onChange?.(updatedItems);
  };

  const handleRemoveItem = (index: number) => {
    if (readOnly) return;

    const updatedItems = items.filter((_, i) => i !== index);
    setItems(updatedItems);
    onChange?.(updatedItems);
  };

  return {
    items,
    setItems,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
  };
}
