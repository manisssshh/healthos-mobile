/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset")],
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark theme (default)
        background: "#060608",
        surface: "#0E0E14",
        card: "#12121A",
        cardMuted: "#1A1A25",
        accentBlue: "#4F7BFF",
        accentPurple: "#9A6CFF",
        textMuted: "#7A7A95",
        success: "#1AE5A7",
        // Performance zones
        zoneHigh: "#1AE5A7",
        zoneMid: "#FFB238",
        zoneLow: "#FF4158",
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "28px"
      },
      boxShadow: {
        soft: "0px 10px 35px rgba(79, 123, 255, 0.15)",
        glow: "0px 0px 24px rgba(26, 229, 167, 0.30)"
      },
      fontFamily: {
        sans: ["System"],
      }
    }
  },
  plugins: []
};
