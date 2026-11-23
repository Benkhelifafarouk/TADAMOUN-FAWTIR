import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B1714',
          900: '#122420',
          800: '#1B342E',
          700: '#2A4A43',
          500: '#4C6B63',
          400: '#6B8780',
          300: '#9BB0AA',
        },
        sand: {
          50: '#FBF9F5',
          100: '#F5F1E8',
          200: '#EBE4D6',
          300: '#DCD2BE',
        },
        brand: {
          50: '#EAF4F0',
          100: '#D2E8DF',
          200: '#A6D1C4',
          300: '#6FB5A3',
          400: '#3E9683',
          500: '#227A67',
          600: '#166353',
          700: '#0F5F52',
          800: '#0B4A40',
          900: '#083731',
        },
        clay: {
          500: '#B4553A',
          600: '#98452E',
        },
        amber: {
          500: '#B77A12',
          600: '#96620C',
        },
      },
      fontFamily: {
        sans: [
          'Noto Kufi Arabic',
          'Noto Sans Arabic',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'Tahoma',
          'sans-serif',
        ],
        display: ['Noto Kufi Arabic', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 23, 20, 0.04), 0 8px 24px -18px rgba(11, 23, 20, 0.35)',
        lift: '0 2px 4px rgba(11, 23, 20, 0.06), 0 18px 40px -24px rgba(11, 23, 20, 0.45)',
      },
      borderRadius: {
        xl2: '1.125rem',
      },
      maxWidth: {
        content: '78rem',
      },
    },
  },
  plugins: [],
};

export default config;
