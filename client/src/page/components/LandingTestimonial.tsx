interface LandingTestimonialProps {
  quote: string;
  author: string;
  role?: string;
  imageSrc?: string;
}

export function LandingTestimonial({
  quote,
  author,
  role,
  imageSrc,
}: LandingTestimonialProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-primary-100 h-full flex flex-col">
      <blockquote className="flex-grow">
        <p className="text-primary-700 italic">"{quote}"</p>
      </blockquote>
      <div className="flex items-center mt-4">
        {imageSrc && (
          <img
            src={imageSrc}
            alt={author}
            className="w-12 h-12 rounded-full mr-4 object-cover"
          />
        )}
        <div>
          <p className="font-semibold text-primary-800">{author}</p>
          {role && <p className="text-sm text-primary-600">{role}</p>}
        </div>
      </div>
    </div>
  );
}
