import { useNavigate, useParams } from "react-router-dom";
import { getLectureById, lectures } from "../data/lectureData";
import { Icons, PrimaryButton } from "../../shared/components/ui";

export function LecturePage() {
  const navigate = useNavigate();
  const { lectureId } = useParams<{ lectureId: string }>();

  const lecture = lectureId ? getLectureById(lectureId) : undefined;

  // Find current lecture index and determine prev/next lectures
  const currentIndex = lecture
    ? lectures.findIndex((l) => l.id === lecture.id)
    : -1;
  const previousLecture = currentIndex > 0 ? lectures[currentIndex - 1] : null;
  const nextLecture =
    currentIndex >= 0 && currentIndex < lectures.length - 1
      ? lectures[currentIndex + 1]
      : null;

  if (!lecture) {
    return (
      <div className="max-w-2xl mx-auto p-4 font-lora">
        <div className="text-center">
          <h1 className="text-2xl font-montserrat font-semibold mb-4 text-primary-800">
            Lecture Not Found
          </h1>
          <p className="mb-4 text-primary-600">
            The lecture you're looking for doesn't exist.
          </p>
          <button
            onClick={() => navigate("/academy")}
            className="text-link hover:underline flex items-center gap-2 mx-auto"
          >
            <Icons.ArrowLeft className="h-4 w-4" />
            Back to Academy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 font-lora">
      {/* Back button */}
      <div className="flex justify-center mb-6">
        <PrimaryButton
          onClick={() => navigate("/academy")}
          size="sm"
          variant="outline"
          leftBorder={false}
          leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
        >
          Back to Academy
        </PrimaryButton>
      </div>

      {/* Lecture title */}
      <h1 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        {lecture.title}
      </h1>

      {/* Optional video */}
      {lecture.videoEmbedUrl && (
        <div className="mb-6">
          <div style={{ position: "relative", paddingTop: "56.25%" }}>
            <iframe
              src={lecture.videoEmbedUrl}
              loading="lazy"
              style={{
                border: "0",
                position: "absolute",
                top: "0",
                height: "100%",
                width: "100%",
              }}
              allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
              allowFullScreen={true}
            ></iframe>
          </div>
        </div>
      )}

      {/* Lecture content */}
      <div className="space-y-4">
        <div dangerouslySetInnerHTML={{ __html: lecture.content }} />
      </div>

      {/* Navigation to previous/next lectures */}
      {(previousLecture || nextLecture) && (
        <div className="flex justify-between items-center gap-4 mt-8 pt-6 border-t border-primary-100">
          {previousLecture ? (
            <PrimaryButton
              onClick={() => navigate(`/academy/${previousLecture.id}`)}
              size="sm"
              variant="outline"
              leftBorder={false}
              textAlign="left"
              leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
            >
              {previousLecture.title}
            </PrimaryButton>
          ) : (
            <div></div>
          )}

          {nextLecture && (
            <PrimaryButton
              onClick={() => navigate(`/academy/${nextLecture.id}`)}
              size="sm"
              variant="outline"
              leftBorder={false}
              rightIcon={<Icons.ArrowRight className="h-4 w-4" />}
            >
              {nextLecture.title}
            </PrimaryButton>
          )}
        </div>
      )}
    </div>
  );
}
