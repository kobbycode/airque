/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#E6C280",
        secondary: "#8B4513",
        background: "#0a0a0a",
      },
    },
    // Next.js 15/16 + Tailwind 4 Turbopack compatibility fix
    // This property is sometimes expected by the internal dev overlay logic
    exportedColors: {}
  },
  plugins: [],
};
