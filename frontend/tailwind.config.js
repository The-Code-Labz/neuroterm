export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neuro: {
          bg:     '#0d1117',
          panel:  '#161b22',
          border: '#30363d',
          green:  '#00ff41',
          cyan:   '#00d4ff',
          red:    '#ff4757',
          yellow: '#ffa502',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
