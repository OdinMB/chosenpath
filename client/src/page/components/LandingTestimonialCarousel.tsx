import { Carousel } from "./Carousel";
import { LandingTestimonial } from "./LandingTestimonial";

interface TestimonialData {
  quote: string;
  author: string;
  role?: string;
  imageSrc?: string;
}

interface LandingTestimonialCarouselProps {
  testimonials: TestimonialData[];
}

export function LandingTestimonialCarousel({
  testimonials,
}: LandingTestimonialCarouselProps) {
  const testimonialItems = testimonials.map((testimonial, index) => (
    <LandingTestimonial key={index} {...testimonial} />
  ));

  return (
    <Carousel
      items={testimonialItems}
      showControls={true}
      showDots={true}
      className="mx-auto"
      itemsPerView={2}
      itemsPerViewMobile={1}
    />
  );
}
