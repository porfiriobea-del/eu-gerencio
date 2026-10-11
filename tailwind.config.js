/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary, #2563EB)',
          50: 'var(--color-palette-1, #F8FAFC)',
          100: '#EFF6FF',
          200: 'var(--color-palette-3, #DBEAFE)',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: 'var(--color-primary, #2563EB)',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: 'var(--color-palette-5, #0F172A)',
          foreground: 'var(--color-primary-foreground, #FFFFFF)',
        },
        palette: {
          1: 'var(--color-palette-1, #F8FAFC)',
          2: 'var(--color-palette-2, #FFFFFF)',
          3: 'var(--color-palette-3, #DBEAFE)',
          4: 'var(--color-palette-4, #2563EB)',
          5: 'var(--color-palette-5, #0F172A)',
        },
        background: 'var(--color-background, #F8FAFC)',
        surface: 'var(--color-surface, #FFFFFF)',
        card: 'var(--color-surface, #FFFFFF)',
        foreground: 'var(--color-foreground, #0F172A)',
        muted: {
          DEFAULT: 'var(--color-muted, #F1F5F9)',
          foreground: 'var(--color-muted-foreground, #475569)',
        },
        border: 'var(--color-border, #DBEAFE)',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
