/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Material Dark surface palette
        mat: {
          bg:       'var(--md-bg)',
          surface:  'var(--md-surface)',
          surface2: 'var(--md-surface2)',
          surface3: 'var(--md-surface3)',
          border:   'var(--md-border-strong)',
          border2:  'var(--md-border-strong)',
          on:       'var(--md-on)',
          muted:    'var(--md-muted)',
          dim:      'var(--md-dim)',
        },
        // Primary accent - Material Indigo-Blue
        primary: {
          50:  '#e8eaf6',
          100: '#c5cae9',
          200: '#9fa8da',
          300: '#7986cb',
          400: '#5c6bc0',
          500: '#3f51b5',  // primary
          600: '#3949ab',
          700: '#303f9f',
          800: '#283593',
          900: '#1a237e',
          DEFAULT: '#5c6bc0',
          hover: '#7986cb',
          light: '#3f51b515',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e2',
          300: '#b0b8c8',
          400: '#8591a8',
          500: '#66738e',
          600: '#515c75',
          700: '#434b5f',
          800: '#3a4050',
          900: '#333845',
          950: '#22252e',
        },
        desk: {
          DEFAULT: '#1f4e79',
          light: '#e8f0f8',
          dark: '#163a5a',
        },
        brand: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
        },
      },
      boxShadow: {
        'mat-sm':  '0 1px 3px rgba(20,18,28,0.28)',
        'mat-md':  '0 4px 12px rgba(20,18,28,0.32)',
        'mat-lg':  '0 8px 24px rgba(20,18,28,0.36)',
        'mat-xl':  '0 16px 48px rgba(20,18,28,0.42)',
      },
    },
  },
  plugins: [],
};
