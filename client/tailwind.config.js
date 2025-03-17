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
          DEFAULT: "#1B1F3A",
          50: "rgba(27, 31, 58, 0.05)",
          100: "rgba(27, 31, 58, 0.1)",
          200: "rgba(27, 31, 58, 0.2)",
          300: "rgba(27, 31, 58, 0.3)",
          400: "rgba(27, 31, 58, 0.4)",
          500: "rgba(27, 31, 58, 0.5)",
          600: "rgba(27, 31, 58, 0.6)",
          700: "rgba(27, 31, 58, 0.7)",
          800: "rgba(27, 31, 58, 0.8)",
          900: "rgba(27, 31, 58, 0.9)",
        },
        accent: {
          DEFAULT: "#00B4D8",
          50: "rgba(0, 180, 216, 0.05)",
          100: "rgba(0, 180, 216, 0.1)",
          200: "rgba(0, 180, 216, 0.2)",
          300: "rgba(0, 180, 216, 0.3)",
          400: "rgba(0, 180, 216, 0.4)",
          500: "rgba(0, 180, 216, 0.5)",
          600: "rgba(0, 180, 216, 0.6)",
          700: "rgba(0, 180, 216, 0.7)",
          800: "rgba(0, 180, 216, 0.8)",
          900: "rgba(0, 180, 216, 0.9)",
        },
        secondary: {
          DEFAULT: "#F4A261",
        },
        tertiary: {
          DEFAULT: "#A37DF6",
        },
      },
      boxShadow: {
        "glow-accent": "0 0 15px rgba(0, 180, 216, 0.4)",
        "glow-accent-lg": "0 0 20px rgba(0, 180, 216, 0.6)",
        "glow-secondary": "0 0 15px rgba(244, 162, 97, 0.4)",
        "glow-secondary-lg": "0 0 20px rgba(244, 162, 97, 0.6)",
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
        "henny-penny": ['"Henny Penny"', "cursive"],
        lora: ['"Lora"', "serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
