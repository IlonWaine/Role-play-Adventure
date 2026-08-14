/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/templates/**/*.html",
    "./src/static/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        'card': '#1a1d24',
        'card-hover': '#242832',
        'gold': '#fbbf24',
        'gold-dark': '#d97706',
      },
      fontFamily: {
        'sans': ['Segoe UI', 'Tahoma', 'Geneva', 'Verdana', 'sans-serif'],
      }
    },
  },
  plugins: [],
}