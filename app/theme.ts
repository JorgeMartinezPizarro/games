import { createTheme } from '@mui/material/styles';

// Dark theme shared by the whole app. Colors come from the CSS tokens in
// globals.css (--bg, --surface, --accent…): each game sets its --accent in
// its GameShell and "contained" buttons inherit it without a theme of their own.
const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0b0e14', paper: '#131823' },
    text: { primary: '#edf0f7', secondary: '#8b93a7' },
    primary: { main: '#8b93ff', contrastText: '#0b0e14' },
    divider: 'rgba(255, 255, 255, 0.07)',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'var(--font-sans), system-ui, sans-serif',
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.95rem' },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          paddingInline: 18,
          borderRadius: 12,
          gap: 4,
        },
        contained: {
          background: 'var(--accent)',
          color: 'var(--on-accent)',
          '&:hover': { background: 'var(--accent)', filter: 'brightness(1.08)' },
        },
        outlined: {
          background: 'var(--surface)',
          borderColor: 'var(--line)',
          color: 'var(--text)',
          '&:hover': { background: 'var(--surface-2)', borderColor: 'var(--line-strong)' },
        },
        text: { color: 'var(--text-muted)', '&:hover': { color: 'var(--text)' } },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiSlider: {
      styleOverrides: {
        root: { color: 'var(--accent)' },
        thumb: { width: 16, height: 16, borderRadius: '50%', boxShadow: 'none' },
        rail: { opacity: 0.25 },
        markLabel: { color: 'var(--text-muted)', fontSize: 12 },
      },
    },
  },
});

export default theme;
