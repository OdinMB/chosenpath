/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        fadeIn: "fadeIn 0.3s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
      fontFamily: {
        "henny-penny": ['"Henny Penny"', "cursive"],
        lora: ['"Lora"', "serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
