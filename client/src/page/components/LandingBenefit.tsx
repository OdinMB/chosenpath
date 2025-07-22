import { useState } from "react";

interface LandingBenefitProps {
  imageSrc?: string;
  title: string;
  description: string;
}

export function LandingBenefit({
  imageSrc,
  title,
  description,
}: LandingBenefitProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageLoaded(false);
  };

  return (
    <div className="bg-white rounded-lg border border-primary-100 overflow-hidden">
      {imageSrc && (
        <div className="relative h-32 md:h-24 overflow-hidden bg-gray-100">
          <img
            src={imageSrc}
            alt={title}
            className={`w-full h-full object-cover transition-all duration-500 hover:scale-110 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      )}
      <div className="p-6 md:p-4">
        <h3 className="text-xl font-montserrat font-semibold mb-3 text-primary-700">
          {title}
        </h3>
        <p className="text-primary-600">{description}</p>
      </div>
    </div>
  );
}
