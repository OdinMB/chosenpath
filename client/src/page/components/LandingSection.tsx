import React from "react";

interface LandingSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function LandingSection({ title, children, className = "" }: LandingSectionProps) {
  return (
    <section className={`mb-12 ${className}`}>
      <h2 className="text-2xl font-montserrat font-semibold mb-6 text-primary-800">
        {title}
      </h2>
      {children}
    </section>
  );
}