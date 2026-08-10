import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * elowa design tokens.
 *
 * All colours are declared as CSS custom properties in `src/index.css` using
 * HSL channel triplets (e.g. `158 30% 30%`) and consumed here via `hsl(var(--x))`.
 * This keeps a single source of truth and lets a future theme (or dark mode)
 * swap the variables without touching component code.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        // App shell (the "device" backdrop behind the mobile canvas)
        canvas: 'hsl(var(--canvas))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        // Brand accent palette (used for illustration accents, tags, charts)
        coral: 'hsl(var(--coral))',
        lilac: 'hsl(var(--lilac))',
        sage: 'hsl(var(--sage))',
        beige: 'hsl(var(--beige))',
        // Semantic status
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        attention: {
          DEFAULT: 'hsl(var(--attention))',
          foreground: 'hsl(var(--attention-foreground))',
        },
      },
      borderRadius: {
        // Named on top of the CSS variable so radii stay consistent
        sm: 'calc(var(--radius) - 6px)',
        md: 'calc(var(--radius) - 3px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 6px)',
        '2xl': 'calc(var(--radius) + 12px)',
        '3xl': 'calc(var(--radius) + 20px)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
      },
      boxShadow: {
        // Very subtle, warm-tinted elevation
        card: '0 1px 2px hsl(var(--shadow-color) / 0.04), 0 8px 24px -12px hsl(var(--shadow-color) / 0.12)',
        raised: '0 2px 4px hsl(var(--shadow-color) / 0.05), 0 16px 40px -16px hsl(var(--shadow-color) / 0.18)',
        nav: '0 -1px 2px hsl(var(--shadow-color) / 0.03), 0 -8px 24px -12px hsl(var(--shadow-color) / 0.12)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
      },
    },
  },
  plugins: [animate],
};

export default config;
