/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      animation: {
        shake: 'shake 0.4s ease-in-out',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-6px)' },
          '40%': { transform: 'translateX(6px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
      },
      colors: {
        brand: {
          black:   '#000000',
          yellow:  '#ffd100',
          white:   '#fefefe',
          asphalt: '#1e2328',
          beacon:  '#ffe169',
          glow:    '#fff0be',
          slate:   '#c1c8cb',
        },
      },
    },
  },
  plugins: [],
};
