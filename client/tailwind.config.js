/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aurum identity: gold arrow + blue bars (client-approved logo)
        brand: {
          green: '#F59E0B',
          yellow: '#FBBF24',
          'green-light': '#FCD34D',
        },
        gold: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#B45309',
          700: '#92400E',
        },
        navy: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          600: '#1E40AF',
          700: '#1E3A8A',
          800: '#172E6E',
          900: '#0F1F4B',
          950: '#0A1533',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
        },
      },
      fontFamily: {
        // Inter for dense UI (tables, forms); Montserrat is the geometric sans
        // that matches the logo lettering — used for the wordmark and headings.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-md': '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
        'card-lg': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
