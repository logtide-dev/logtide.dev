/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  safelist: ['dark'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1152px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          // Brand purple for TEXT: darker in light mode, lighter in dark.
          readable: 'hsl(var(--primary-readable) / <alpha-value>)',
          50: 'hsl(270 100% 98%)',
          100: 'hsl(269 100% 95%)',
          200: 'hsl(269 100% 92%)',
          300: 'hsl(269 97% 85%)',
          400: 'hsl(270 95% 75%)',
          500: 'hsl(262 83% 58%)',
          600: 'hsl(262 83% 50%)',
          700: 'hsl(263 70% 45%)',
          800: 'hsl(263 69% 38%)',
          900: 'hsl(264 67% 32%)',
          950: 'hsl(265 85% 18%)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
          text: 'hsl(var(--destructive-text) / <alpha-value>)',
        },
        // Same semantic tokens as the app (utils/severity.ts).
        nav: {
          active: 'hsl(var(--nav-active) / <alpha-value>)',
          'active-foreground': 'hsl(var(--nav-active-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          text: 'hsl(var(--success-text) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          text: 'hsl(var(--warning-text) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          text: 'hsl(var(--info-text) / <alpha-value>)',
        },
        critical: {
          DEFAULT: 'hsl(var(--critical) / <alpha-value>)',
          text: 'hsl(var(--critical-text) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
      },
      // Controls 8px, panels 12px. xl/2xl/3xl collapse onto the panel radius
      // so a stray `rounded-2xl` cannot add a third corner size.
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 4px)',
        '3xl': 'calc(var(--radius) + 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // Marketing hero only; inner pages keep `display`.
        hero: ['clamp(3rem, 1.6rem + 5.6vw, 6.5rem)', { lineHeight: '0.95', letterSpacing: '-0.032em' }],
        display: ['clamp(2.25rem, 1.27rem + 1.92vw, 3rem)', { lineHeight: '1.06', letterSpacing: '-0.028em' }],
        section: ['clamp(2.25rem, 1.5rem + 2.6vw, 4rem)', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      maxWidth: {
        prose: '65ch',
      },
      boxShadow: {
        // Tinted to the neutral hue, not pure black.
        panel: '0 1px 2px hsl(240 24% 8% / 0.04), 0 12px 32px -12px hsl(240 24% 8% / 0.10)',
        'panel-lg': '0 1px 2px hsl(240 24% 8% / 0.05), 0 28px 64px -24px hsl(240 24% 8% / 0.18)',
        // Violet glow behind the product window and code panels (dark theme).
        glow: '0 40px 140px -50px hsl(262 83% 58% / 0.6), 0 0 0 6px hsl(0 0% 100% / 0.02)',
        'glow-sm': '0 30px 100px -50px hsl(262 83% 58% / 0.5)',
      },
    },
  },
  plugins: [],
};
