export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Full 224px labeled sidebar only from here up; icon rail between
        // `sm` (640px, drawer breakpoint) and this.
        'shell-md': '900px',
      },
      colors: {
        // Field Console semantic tokens — mapped to CSS custom properties in
        // index.css so the whole palette lives in one place. Do not add
        // literal hex/gray/cyan utilities in components; extend this table
        // instead.
        canvas: 'var(--bg-canvas)',
        base: 'var(--bg-base)',
        surface1: 'var(--surface-1)',
        surface2: 'var(--surface-2)',
        surface3: 'var(--surface-3)',
        termbg: 'var(--terminal-bg)',
        edge: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        ink: {
          strong: 'var(--text-strong)',
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          ink: 'var(--accent-ink)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        focus: 'var(--focus)',
        // Legacy aliases — deliberately kept and repointed to the new dark
        // neutral/teal tokens (not the old neon values) so any stray
        // reference that slips through review still renders on-system
        // instead of neon cyan/green.
        neuro: {
          bg: 'var(--bg-canvas)',
          panel: 'var(--surface-1)',
          border: 'var(--border-default)',
          green: 'var(--success)',
          cyan: 'var(--accent)',
          red: 'var(--danger)',
          yellow: 'var(--warning)',
        },
      },
      fontFamily: {
        sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      fontSize: {
        brand: ['28px', { lineHeight: '34px', fontWeight: '650' }],
        'page-title': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        'section-title': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '22px', fontWeight: '400' }],
        control: ['13px', { lineHeight: '20px', fontWeight: '550' }],
        label: ['13px', { lineHeight: '18px', fontWeight: '550' }],
        meta: ['12px', { lineHeight: '18px', fontWeight: '450' }],
        'meta-mono': ['12px', { lineHeight: '18px', fontWeight: '500' }],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        window: '0 24px 64px rgba(0,0,0,.48), 0 2px 8px rgba(0,0,0,.28)',
        'window-unfocused': '0 12px 32px rgba(0,0,0,.34)',
        sheet: '0 24px 64px rgba(0,0,0,.48), 0 2px 8px rgba(0,0,0,.28)',
      },
      keyframes: {
        'sheet-in': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'dialog-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in 180ms ease-out',
        'dialog-in': 'dialog-in 180ms ease-out',
        'fade-in': 'fade-in 160ms ease-out',
      },
    },
  },
  plugins: [],
};
