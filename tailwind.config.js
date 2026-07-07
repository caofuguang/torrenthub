/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 工业仪表盘暗色调色板
        ink: {
          950: '#0A0E0F',
          900: '#0F1416',
          850: '#141A1D',
          800: '#1A1F22',
          750: '#222830',
          700: '#2A3138',
          600: '#3A434C',
          500: '#4A5560',
          400: '#6B7682',
          300: '#9AA4AE',
          200: '#C5CCD3',
          100: '#E6E9ED',
        },
        neon: {
          DEFAULT: '#00E676',
          400: '#33EB91',
          600: '#00B85E',
        },
        amber: {
          DEFAULT: '#FFB300',
          400: '#FFC747',
        },
        vermilion: {
          DEFAULT: '#FF3D00',
          400: '#FF6E40',
        },
        qbit: '#7C4DFF',
        trans: '#00B8D4',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'neon': '0 0 0 1px rgba(0,230,118,0.3), 0 0 20px -4px rgba(0,230,118,0.4)',
        'neon-soft': '0 0 12px -6px rgba(0,230,118,0.5)',
        'card': '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-up': 'fade-up 0.4s ease-out',
        'scan': 'scan 3s linear infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,61,0,0.5)' },
          '50%': { boxShadow: '0 0 0 6px rgba(255,61,0,0)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      backgroundImage: {
        'grid': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
