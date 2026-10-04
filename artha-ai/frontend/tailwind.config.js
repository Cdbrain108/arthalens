/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#131518',        // Google AI Studio main canvas
        panel: '#1e2026',      // Google AI Studio card / input surface
        side: '#181a1f',       // Google AI Studio sidebar
        rail: '#131518',       // slim icon rail
        line: 'rgba(255, 255, 255, 0.08)',
        primary: '#f1f3f4',    // Google AI Studio main text
        muted: '#9aa0a6',      // Google secondary text
        accent: '#4285f4',     // Google blue
        violet: '#9b72cb',     // Google purple
        emerald: '#34a853',    // Google green
        amber: '#fbbc04',      // Google yellow
        rose: '#ea4335',       // Google red
        cyan: '#78d9ec',       // Google cyan
        googleBlue: '#4285f4',
        googlePurple: '#9b72cb',
        googleRed: '#ea4335',
        googleYellow: '#fbbc04',
        googleGreen: '#34a853',
      },
      fontFamily: {
        sans: ['Inter', 'Google Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { xl2: '1.75rem' },
      boxShadow: {
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.04), 0 8px 24px -12px rgba(0,0,0,0.6)',
        lift: '0 16px 40px -16px rgba(0,0,0,0.75)',
        'glow-accent': '0 0 44px -10px rgba(66, 133, 244, 0.5)',
        'glow-violet': '0 0 44px -10px rgba(155, 114, 203, 0.5)',
        'inner-line': 'inset 0 0 0 1px rgba(255,255,255,0.04)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.92)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.35' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'pop-in': 'pop-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-soft': 'pulse-soft 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
