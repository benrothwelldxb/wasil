import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // AA-compliant text variant of `accent` (see src/index.css for the
        // contrast math). Use `text-accent-strong` for readable text;
        // `bg-accent`/`text-accent-foreground` remain the fill pairing.
        // Also usable as a fill (`bg-accent-strong`) for selected/on states
        // that need a darker-than-`accent` background, paired with the same
        // `accent-foreground` text colour.
        'accent-strong': {
          DEFAULT: 'hsl(var(--accent-strong))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // AA-compliant text variant of `destructive` (identical to
        // `destructive` in light theme; bumped in dark theme — see
        // src/index.css). Use `text-destructive-strong` for readable text;
        // `bg-destructive`/`text-destructive-foreground` remain the fill pairing.
        'destructive-strong': {
          DEFAULT: 'hsl(var(--destructive-strong))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // Journey Score band text variants — AA-compliant companions to the
        // (unchanged) --score-high/-mid/-low ring-stroke colours. Intended
        // for the ExperienceRing centre number and any other text labelled
        // by score band.
        'score-high-text': 'hsl(var(--score-high-text))',
        'score-mid-text': 'hsl(var(--score-mid-text))',
        'score-low-text': 'hsl(var(--score-low-text))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
