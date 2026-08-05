import type { Config } from 'tailwindcss';

/**
 * "Forged Light" design system.
 *
 * Near-monochromatic: dark forged steel + glowing blue. The single warm colour
 * anywhere on the site is the heart (#FF5B73) — nothing else may compete with it.
 *
 * Legacy brand families (forge / ember / flame / teal / healing / bronze / warm /
 * cream / steel / charcoal / deep) are retained as *aliases* so existing markup keeps
 * compiling, but every ramp now resolves into the steel-and-blue palette. A future
 * palette change is a single edit here plus the token block in app/globals.css.
 */

// Raw brand values — the source of truth.
const OBSIDIAN = '#05070A'; // page background
const GUNMETAL = '#11161C'; // raised surface
const STEEL = '#1A232C'; // card / panel
const CARD = '#151B22'; // card per spec
const DIVIDER = '#27313B'; // hairline
const FORGED_BLUE = '#53D6FF'; // primary accent
const FORGED_BLUE_HOVER = '#82E8FF';
const ICE_BLUE = '#8DEBFF'; // bright accent / icons
const ON_ACCENT = '#061016'; // text on a bright blue fill
const WHITE = '#F6FAFC';
const BODY = '#B8C4CF';
const SILVER = '#A9B8C6';
const LABEL = '#7C8B97';
const HEART = '#FF5B73'; // sacred — heart only
const HEART_TINT = '#FF5B73'; // kept as alias; functional states use ice blue

/**
 * The heart's own interior, sampled from the hero footage by
 * scripts/sample-hero-palette.mjs rather than picked by eye. The heart is darkest at
 * its centre and brightens toward its rim, so these run from the deep interior out.
 * Quick Exit is drawn from this family, which is the single deliberate exception to
 * "warm colour belongs to the heart alone" — it ties the escape affordance to the
 * heart's meaning. Mirrored by the --heart-interior-* tokens in app/globals.css.
 */
const heartInterior = {
  deep: '#6F0D12', // darkest quartile of the inner half
  DEFAULT: '#950D12', // mean of the innermost 17% of the radius
  lit: '#A91115', // median interior band
  glow: '#DC262F', // mid-bright band
  rim: '#E74D5B', // bright rim band
};

/**
 * The colour of steel at working heat, from Planck's law via
 * scripts/compute-heat-ramp.mjs. The footage has no incandescent source to sample —
 * its flame is cyan and its only warm pixels are the heart's crimson — so the ramp is
 * derived from blackbody radiation instead. Keyed by temperature in Kelvin, hottest
 * first. Mirrored by the --heat-* tokens in app/globals.css.
 */
const heatRamp = {
  core: '#FDF9F5', // white at working heat; relLum 0.952, same as WHITE
  5600: '#FFEFE4', // near white, faintly warm
  3300: '#FFC280', // pale amber
  2700: '#FFAE59', // amber
  2200: '#FF982F', // orange
  1800: '#FF8100', // deep orange
  1500: '#FF6A00', // forge red
};

/** Cool steel ramp, light -> dark. Shared by steel / charcoal / deep / bronze aliases. */
const steelRamp = {
  50: WHITE,
  100: '#E4EBF1',
  200: SILVER,
  300: '#8C9CAA',
  400: LABEL,
  500: '#5C6B77',
  600: '#39454F',
  700: DIVIDER,
  800: STEEL,
  900: GUNMETAL,
  950: OBSIDIAN,
};

/** Forged blue ramp, light -> dark. */
const blueRamp = {
  50: '#EAFAFF',
  100: '#C9F3FF',
  200: '#A6EBFF',
  300: ICE_BLUE,
  400: '#6FDFFF',
  500: FORGED_BLUE,
  600: '#33BEEB',
  700: '#219EC6',
  800: '#17789A',
  900: '#10556E',
  950: '#0A3446',
};

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ============================================
        // FORGED LIGHT — canonical names
        // ============================================
        obsidian: OBSIDIAN,
        gunmetal: GUNMETAL,
        surface: {
          DEFAULT: GUNMETAL,
          raised: STEEL,
          card: CARD,
          sunken: '#0A0E13',
        },
        forged: { DEFAULT: FORGED_BLUE, hover: FORGED_BLUE_HOVER, on: ON_ACCENT, ...blueRamp },
        ice: { DEFAULT: ICE_BLUE, ...blueRamp },
        silver: { DEFAULT: SILVER, body: BODY, label: LABEL },
        divider: DIVIDER,

        /**
         * The heart. Warm colour belongs to it, with one deliberate exception:
         * `heart-interior-*` clothes Quick Exit, so the escape affordance carries the
         * heart's own deep red rather than a generic alarm red.
         */
        heart: { DEFAULT: HEART, tint: HEART_TINT, interior: heartInterior },

        /** Steel at working heat. Used for the hero's incandescent copy. */
        heat: heatRamp,

        // ============================================
        // LEGACY ALIASES — remapped onto Forged Light
        // ============================================
        forge: { DEFAULT: FORGED_BLUE, ...blueRamp },
        ember: { DEFAULT: FORGED_BLUE, ...blueRamp },
        teal: { DEFAULT: FORGED_BLUE, deep: '#10556E', ...blueRamp },
        flame: {
          DEFAULT: FORGED_BLUE,
          light: ICE_BLUE,
          dark: '#33BEEB',
          soft: '#A6EBFF',
        },
        healing: { DEFAULT: ICE_BLUE, ...blueRamp },
        bronze: { DEFAULT: SILVER, ...steelRamp },
        steel: { DEFAULT: DIVIDER, ...steelRamp },
        charcoal: { DEFAULT: GUNMETAL, ...steelRamp },
        deep: {
          DEFAULT: OBSIDIAN,
          50: STEEL,
          100: CARD,
          200: GUNMETAL,
          300: OBSIDIAN,
          400: '#080B0F',
        },
        warm: {
          ivory: WHITE,
          cream: '#E4EBF1',
          sand: SILVER,
          stone: LABEL,
          earth: DIVIDER,
        },
        highlight: {
          gold: ICE_BLUE,
          amber: '#6FDFFF',
          rose: HEART,
        },
        cream: {
          DEFAULT: WHITE,
          50: '#FFFFFF',
          100: WHITE,
          200: '#E4EBF1',
          300: BODY,
          warm: WHITE,
        },
        text: {
          primary: WHITE,
          secondary: BODY,
          muted: SILVER,
          label: LABEL,
        },

        // ShadCN UI tokens (driven by CSS custom properties in globals.css)
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
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in-down': 'fadeInDown 0.6s ease-out',
        // Ambient pulses echo the hero flame: slow 7s breathing, never a flash.
        'glow-pulse': 'glowPulse 7s ease-in-out infinite',
        'ambient-pulse': 'ambientPulse 7s ease-in-out infinite',
        'ember-float': 'emberFloat 8s ease-in-out infinite',
        'particle-drift': 'particleDrift 26s linear infinite',
        'slow-spin': 'spin 20s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '0.85' },
        },
        ambientPulse: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.04)' },
        },
        emberFloat: {
          '0%, 100%': { transform: 'translateY(0) scale(1)', opacity: '0.55' },
          '50%': { transform: 'translateY(-8px) scale(1.03)', opacity: '0.9' },
        },
        // ~7px/sec drift over a 180px travel.
        particleDrift: {
          '0%': { transform: 'translate3d(0,0,0)', opacity: '0' },
          '12%': { opacity: '0.5' },
          '88%': { opacity: '0.5' },
          '100%': { transform: 'translate3d(14px,-180px,0)', opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        // Brand gradients — cold light emerging from darkness.
        'forge-glow':
          'linear-gradient(135deg, rgba(83,214,255,0.10) 0%, rgba(83,214,255,0.03) 50%, transparent 100%)',
        'bronze-glow':
          'linear-gradient(135deg, rgba(141,235,255,0.08) 0%, rgba(141,235,255,0.02) 50%, transparent 100%)',
        'warm-ivory': `linear-gradient(180deg, ${GUNMETAL} 0%, ${OBSIDIAN} 100%)`,
        'forge-radial': 'radial-gradient(circle at 50% 50%, rgba(83,214,255,0.07) 0%, transparent 70%)',
        'ember-ambient':
          'radial-gradient(ellipse at 30% 20%, rgba(83,214,255,0.05) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(141,235,255,0.04) 0%, transparent 50%)',
        'page-forge': `radial-gradient(circle at top, #102433, ${OBSIDIAN} 70%)`,
        // Glowing horizon, not a line.
        'divider-glow':
          'linear-gradient(90deg, transparent, rgba(83,214,255,0.35), transparent)',
      },
      boxShadow: {
        // Everything glows; nothing darkens. Glow alpha never exceeds 0.15.
        forge: '0 0 40px rgba(83,214,255,0.12)',
        'forge-sm': '0 0 20px rgba(83,214,255,0.10)',
        glow: '0 0 40px rgba(83,214,255,0.12)',
        'glow-sm': '0 0 18px rgba(83,214,255,0.09)',
        'glow-lg': '0 0 64px rgba(83,214,255,0.14)',
        rim: '0 0 0 1px rgba(83,214,255,0.28), 0 0 32px rgba(83,214,255,0.12)',
        bronze: '0 0 40px rgba(141,235,255,0.10)',
        warm: '0 0 20px rgba(83,214,255,0.08)',
        'warm-lg': '0 0 40px rgba(83,214,255,0.10)',
        card: '0 0 18px rgba(83,214,255,0.07)',
        'card-hover': '0 0 40px rgba(83,214,255,0.13)',
        soft: '0 0 20px rgba(83,214,255,0.06)',
        'soft-lg': '0 0 40px rgba(83,214,255,0.09)',
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '800': '800ms',
        '1000': '1000ms',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.4, 0, 0.2, 1)',
        gentle: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
