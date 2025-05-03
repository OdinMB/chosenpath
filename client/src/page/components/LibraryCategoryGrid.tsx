import { PrimaryButton } from "components/ui";
import { CategoryTile } from "./CategoryTile";

interface LibraryCategoryGridProps {
  onBrowseLibrary: (categoryTag?: string) => void;
}

export function LibraryCategoryGrid({
  onBrowseLibrary,
}: LibraryCategoryGridProps) {
  const categories = [
    {
      id: "fiction",
      title: "Enjoy Fiction",
      image: "/category-fiction.jpeg",
      tag: "Fiction",
    },
    {
      id: "kids",
      title: "Read with Kids",
      image: "/category-kids.jpeg",
      tag: "Kids",
    },
    {
      id: "pretendtobe",
      title: "Pretend to be",
      image: "/category-pretendtobe.jpeg",
      tag: "Pretend to be",
    },
    {
      id: "vent",
      title: "Vent about Reality",
      image: "/category-vent.jpeg",
      tag: "Satire",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg overflow-hidden border border-primary-100">
        <div className="grid grid-cols-2">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`
                ${index % 2 !== 0 ? "border-l border-primary-100" : ""}
                ${index < 2 ? "border-b border-primary-100" : ""}
              `}
            >
              <CategoryTile
                image={category.image}
                title={category.title}
                onClick={() => onBrowseLibrary(category.tag)}
              />
            </div>
          ))}
        </div>
      </div>
      <PrimaryButton onClick={() => onBrowseLibrary()} fullWidth size="lg">
        Browse Entire Library
      </PrimaryButton>
    </div>
  );
}
