import type { Config } from 'tailwindcss'

/**
 * Be a Good Egg — design tokens.
 * 80% modern application, 20% playful stationery.
 * Warm cream ground, near-black ink, restrained pastel accents.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm cream application background
        cream: {
          DEFAULT: '#F7F3E9',
          50: '#FBF9F2',
          100: '#F7F3E9',
          200: '#F0E9D8',
          300: '#E8DFC8',
          400: '#DED2B6',
        },
        // Near-black typography
        ink: {
          DEFAULT: '#1B1915',
          soft: '#4A463D',
          muted: '#847E71',
          faint: '#B4AE9F',
        },
        // Restrained pastel accents
        yolk: {
          DEFAULT: '#F7C948',
          soft: '#FBE3A0',
          deep: '#E8B22E',
          tint: '#FDF3D6',
        },
        lilac: {
          DEFAULT: '#B79DDD',
          soft: '#D8CBEE',
          deep: '#9A79CF',
          tint: '#EEE7F7',
        },
        sage: {
          DEFAULT: '#A9C9A4',
          soft: '#CFE0CB',
          deep: '#7FA978',
          tint: '#E7F0E4',
        },
        coral: {
          DEFAULT: '#F0674F',
          soft: '#F7A491',
          deep: '#D84C34',
          tint: '#FCE3DD',
        },
        peach: {
          DEFAULT: '#F6C9A8',
          soft: '#FBE1CF',
          tint: '#FDF0E6',
        },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', 'Fraunces', 'Georgia', 'serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,25,21,0.04), 0 8px 24px -12px rgba(27,25,21,0.12)',
        'card-hover': '0 2px 4px rgba(27,25,21,0.06), 0 16px 36px -14px rgba(27,25,21,0.18)',
        pill: '0 8px 20px -8px rgba(27,25,21,0.35)',
        focus: '0 0 0 3px rgba(183,157,221,0.55)',
      },
      keyframes: {
        'egg-wobble': {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'egg-wobble': 'egg-wobble 2.4s ease-in-out infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
      },
      maxWidth: {
        app: '30rem', // ~480px participant column
      },
    },
  },
  plugins: [],
} satisfies Config
