interface CategoryTileProps {
  image: string;
  title: string;
  onClick: () => void;
}

export function CategoryTile({ image, title, onClick }: CategoryTileProps) {
  // The percentage to offset from the top
  const topOffset = "15%";

  return (
    <div
      onClick={onClick}
      className="cursor-pointer overflow-hidden bg-white flex flex-col h-full"
    >
      <div className="relative overflow-hidden h-20">
        <img
          src={image}
          alt={title}
          className="absolute w-full h-auto min-h-full transition-transform duration-500 hover:scale-110"
          style={{
            objectFit: "cover",
            top: `-${topOffset}`,
            left: 0,
          }}
        />
      </div>
      <div className="p-1.5 text-center font-medium text-primary-700">
        {title}
      </div>
    </div>
  );
}
