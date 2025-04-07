interface SkeletonBeatProps {
  showImage?: boolean;
}

export function SkeletonBeat({ showImage = true }: SkeletonBeatProps) {
  return (
    <div className="animate-pulse">
      {/* Title skeleton */}
      <div className="h-8 bg-gray-200 rounded max-w-[50%] mx-auto mb-6"></div>

      <div className="narrative-container relative">
        {/* Image skeleton */}
        {showImage && (
          <div className="w-full sm:w-64 sm:float-right sm:ml-6 mb-4 aspect-square sm:h-64 max-w-[256px] mx-auto bg-gray-200 rounded-lg border border-gray-300"></div>
        )}

        {/* Text paragraphs */}
        <div className="narrative-text space-y-4">
          <div className="h-4 bg-gray-200 rounded"></div>
          <div className="h-4 bg-gray-200 rounded w-[95%]"></div>
          <div className="h-4 bg-gray-200 rounded w-[90%]"></div>
          <div className="h-4 bg-gray-200 rounded w-[97%]"></div>
          <div className="h-4 bg-gray-200 rounded w-[85%]"></div>
          <div className="h-4 bg-gray-200 rounded w-[92%]"></div>
        </div>
      </div>

      {/* Options skeleton */}
      <div className="mt-6 space-y-3 max-w-2xl mx-auto">
        <div className="h-16 bg-gray-200 rounded-lg border border-gray-300"></div>
        <div className="h-16 bg-gray-200 rounded-lg border border-gray-300"></div>
        <div className="h-16 bg-gray-200 rounded-lg border border-gray-300"></div>
      </div>
    </div>
  );
}
