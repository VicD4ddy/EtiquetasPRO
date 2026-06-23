/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBg: '#0f172a',
        darkSurface: '#1e293b',
        darkBorder: '#334155',
        primary: '#3b82f6',
        success: '#10b981',
      }
    },
  },
  plugins: [],
}
