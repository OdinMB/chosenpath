import { useNavigate } from "react-router-dom";
import { lectures, Lecture } from "../data/lectureData";
import { ImageCard } from "../../shared/components/ImageCard";
import { PrimaryButton } from "../../shared/components/ui";

interface LectureGridProps {
  className?: string;
}

export function LectureGrid({ className = "" }: LectureGridProps) {
  const navigate = useNavigate();

  const handleJoinLecture = (lecture: Lecture) => {
    navigate(`/academy/${lecture.id}`);
  };

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch ${className}`}
    >
      {lectures.map((lecture) => (
        <div key={lecture.id} className="flex">
          <ImageCard
            publicImagePath={lecture.imagePath}
            title={lecture.title}
            size="large"
            className="cursor-pointer hover:shadow-md transition-shadow flex-1 h-full"
            onClick={() => handleJoinLecture(lecture)}
          >
            <div
              className="flex flex-col h-full cursor-pointer"
              onClick={() => handleJoinLecture(lecture)}
            >
              <div className="flex-grow relative">
                <PrimaryButton
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering the card's onClick
                    handleJoinLecture(lecture);
                  }}
                  size="sm"
                  className="float-right ml-2 mb-2"
                >
                  Join
                </PrimaryButton>
                <h3 className="text-lg font-montserrat font-semibold mb-2 text-primary-800">
                  {lecture.title}
                </h3>
                <p className="text-sm text-primary-600">{lecture.summary}</p>
              </div>
            </div>
          </ImageCard>
        </div>
      ))}
    </div>
  );
}
