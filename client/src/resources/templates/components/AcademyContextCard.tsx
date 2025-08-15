import React from "react";
import { ImageCard } from "shared/components/ImageCard";
import { PrimaryButton, Icons } from "components/ui";

interface AcademyContextCardProps {
  className?: string;
  lectureHref?: string;
  blurb?: string;
  blurbShort?: string;
}

export const AcademyContextCard: React.FC<AcademyContextCardProps> = ({
  className = "",
  lectureHref = "/academy/setting",
  blurb,
  blurbShort,
}) => {
  return (
    <ImageCard
      publicImagePath="/hat.jpeg"
      title="Worldbuilding Academy"
      className={className}
    >
      <div className="flex flex-col h-full">
        <div className="text-sm text-gray-700 mb-3 hidden sm:block">
          {blurb}
        </div>
        <div className="text-sm text-gray-700 mb-3 sm:hidden">{blurbShort}</div>
        <div className="mt-auto flex justify-center">
          <a href={lectureHref} target="_blank" rel="noopener noreferrer">
            <PrimaryButton leftIcon={<Icons.Academy className="h-4 w-4" />}>
              Learn More
            </PrimaryButton>
          </a>
        </div>
      </div>
    </ImageCard>
  );
};
