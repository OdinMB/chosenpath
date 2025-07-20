import { PrimaryButton } from "components/ui";
import { CategoryTile } from "./CategoryTile";
import { useNavigate } from "react-router-dom";

interface LibraryCategoryGridProps {
  onBrowseLibrary: (categoryTag?: string) => void;
}

export function LibraryCategoryGrid({
  onBrowseLibrary,
}: LibraryCategoryGridProps) {
  const navigate = useNavigate();
  
  const categories = [
    {
      id: "fiction",
      title: "Enjoy Fiction",
      image: "/category-fiction.jpeg",
      tag: "Fiction",
    },
    {
      id: "vent",
      title: "Vent about Reality",
      image: "/category-vent.jpeg",
      tag: "Satire",
    },
    {
      id: "pretendtobe",
      title: "Pretend to be",
      image: "/category-pretendtobe.jpeg",
      tag: "Pretend to be",
    },
    {
      id: "futureself",
      title: "Meet your Future Self",
      image: "/category-futureself.jpeg",
      isDeepLink: true,
      deepLinkUrl: "/setup?step=3&category=see-your-future-self&players=1&images=true",
    },
    {
      id: "kids",
      title: "Read with Kids",
      image: "/category-kids.jpeg",
      tag: "Kids",
    },
    {
      id: "learn",
      title: "Learn Something",
      image: "/category-learn.jpeg",
      isDeepLink: true,
      deepLinkUrl: "/setup?step=3&category=learn-something&players=1&images=true",
    },
  ];

  return (
    <div className="space-y-4">
      <PrimaryButton onClick={() => onBrowseLibrary()} fullWidth size="lg">
        Browse Entire Library
      </PrimaryButton>
      <div className="rounded-lg overflow-hidden border border-primary-100">
        <div className="grid grid-cols-2">
          {categories.map((category, index) => {
            const handleClick = () => {
              if (category.isDeepLink && category.deepLinkUrl) {
                navigate(category.deepLinkUrl);
              } else if (category.tag) {
                onBrowseLibrary(category.tag);
              }
            };
            
            return (
              <div
                key={category.id}
                className={`
                  ${index % 2 !== 0 ? "border-l border-primary-100" : ""}
                  ${Math.floor(index / 2) < Math.floor((categories.length - 1) / 2) ? "border-b border-primary-100" : ""}
                `}
              >
                <CategoryTile
                  image={category.image}
                  title={category.title}
                  onClick={handleClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
