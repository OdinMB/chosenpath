/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        fadeIn: "fadeIn 0.3s ease-in-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        sparkle: "sparkle 4s ease infinite",
      },
      colors: {
        primary: {
          DEFAULT: "#000000",
          50: "rgba(0, 0, 0, 0.05)",
          100: "rgba(0, 0, 0, 0.1)",
          200: "rgba(0, 0, 0, 0.2)",
          300: "rgba(0, 0, 0, 0.3)",
          400: "rgba(0, 0, 0, 0.4)",
          500: "rgba(0, 0, 0, 0.5)",
          600: "rgba(0, 0, 0, 0.6)",
          700: "rgba(0, 0, 0, 0.7)",
          800: "rgba(0, 0, 0, 0.8)",
          900: "rgba(0, 0, 0, 0.9)",
        },
        // dark blue
        secondary: {
          DEFAULT: "#1E4999",
          50: "rgba(30, 73, 153, 0.05)",
          100: "rgba(30, 73, 153, 0.1)",
          200: "rgba(30, 73, 153, 0.2)",
          300: "rgba(30, 73, 153, 0.3)",
          400: "rgba(30, 73, 153, 0.4)",
          500: "rgba(30, 73, 153, 0.5)",
          600: "rgba(30, 73, 153, 0.6)",
          700: "rgba(30, 73, 153, 0.7)",
          800: "rgba(30, 73, 153, 0.8)",
          900: "rgba(30, 73, 153, 0.9)",
        },
        // red
        tertiary: {
          DEFAULT: "#FF6B6B",
          50: "rgba(255, 107, 107, 0.05)",
          100: "rgba(255, 107, 107, 0.1)",
          200: "rgba(255, 107, 107, 0.2)",
          300: "rgba(255, 107, 107, 0.3)",
          400: "rgba(255, 107, 107, 0.4)",
          500: "rgba(255, 107, 107, 0.5)",
          600: "rgba(255, 107, 107, 0.6)",
          700: "rgba(255, 107, 107, 0.7)",
          800: "rgba(255, 107, 107, 0.8)",
          900: "rgba(255, 107, 107, 0.9)",
        },
        // green
        accent: {
          DEFAULT: "#01A29D",
          50: "rgba(1, 162, 157, 0.05)",
          100: "rgba(1, 162, 157, 0.1)",
          200: "rgba(1, 162, 157, 0.2)",
          300: "rgba(1, 162, 157, 0.3)",
          400: "rgba(1, 162, 157, 0.4)",
          500: "rgba(1, 162, 157, 0.5)",
          600: "rgba(1, 162, 157, 0.6)",
          700: "rgba(1, 162, 157, 0.7)",
          800: "rgba(1, 162, 157, 0.8)",
          900: "rgba(1, 162, 157, 0.9)",
        },
      },
      boxShadow: {
        "glow-accent": "0 0 15px rgba(1, 162, 157, 0.4)",
        "glow-accent-lg": "0 0 20px rgba(1, 162, 157, 0.6)",
        "glow-secondary": "0 0 15px rgba(0, 0, 0, 0.4)",
        "glow-secondary-lg": "0 0 20px rgba(0, 0, 0, 0.6)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        pulse: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7 },
        },
        sparkle: {
          "0%": {
            backgroundPosition: "0% 0%",
            backgroundImage:
              "radial-gradient(circle, rgba(244, 162, 97, 0.2) 10%, transparent 10%)",
          },
          "25%": {
            backgroundPosition: "25% 25%",
            backgroundImage:
              "radial-gradient(circle, rgba(244, 162, 97, 0.3) 10%, transparent 10%)",
          },
          "50%": {
            backgroundPosition: "50% 50%",
            backgroundImage:
              "radial-gradient(circle, rgba(244, 162, 97, 0.4) 10%, transparent 10%)",
          },
          "75%": {
            backgroundPosition: "75% 75%",
            backgroundImage:
              "radial-gradient(circle, rgba(244, 162, 97, 0.3) 10%, transparent 10%)",
          },
          "100%": {
            backgroundPosition: "100% 100%",
            backgroundImage:
              "radial-gradient(circle, rgba(244, 162, 97, 0.2) 10%, transparent 10%)",
          },
        },
      },
      backgroundSize: {
        "size-200": "200% 200%",
        "size-1000": "1000% 1000%",
      },
      fontFamily: {
        montserrat: ["Montserrat", "sans-serif"],
        "montserrat-bold": ["Montserrat-Bold", "sans-serif"],
        "montserrat-extrabold": ["Montserrat-ExtraBold", "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
