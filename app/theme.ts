import { createTheme } from '@mui/material/styles';

const PRIMARY = '#689B86'
const PRIMARY_LIGHT = '#71a569'
const PRIMARY_DARK = '#71a569'
const PRIMARY_TEXT = "#000"
const PRIMARY_CONTRAST = '#444'
const BUTTON_HEIGHT = 64
const SECONDARY = '#fff'
const SECONDARY_LIGHT = '#71a569'
const SECONDARY_DARK = '#71a569'
const SECONDARY_TEXT = "#fff"
const SECONDARY_CONTRAST = "#fff"

const theme = createTheme({
    palette: {
        text: {
            primary: PRIMARY_TEXT,
            secondary: SECONDARY_TEXT,
        },
        primary: {
            main: PRIMARY,
            light: PRIMARY_LIGHT,
            dark: PRIMARY_DARK,
            contrastText: PRIMARY_CONTRAST,
        },
        secondary: {
            main: SECONDARY,
            light: SECONDARY_LIGHT,
            dark: SECONDARY_DARK,
            contrastText: SECONDARY_CONTRAST,
        },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            
          },
          colorPrimary: {
            background: "#F00"
          },
          colorSecondary: {
            background: "#00F"
          }
        }
      },
    },
  });

export default theme;