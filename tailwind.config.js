/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0B0B0F",
        card: "#141420",
        cardMuted: "#1C1C29",
        accentBlue: "#4F7BFF",
        accentPurple: "#9A6CFF",
        textMuted: "#A8A8BF",
        success: "#45D5A5"
      },
      borderRadius: {
        "2xl": "20px"
      },
      boxShadow: {
        soft: "0px 10px 35px rgba(79, 123, 255, 0.15)"
      }
    }
  },
  plugins: []
};
