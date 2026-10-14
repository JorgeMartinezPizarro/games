'use client'

import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { useNextcloudFrameSync } from './hooks/useNextcloudFrameSync';

// next/font downloads the fonts at build time and serves them from the app itself:
// no requests to Google from the browser (no tracking).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useNextcloudFrameSync();

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <title>
          Gaming
        </title>
      </head>
      <body>
      <ThemeProvider theme={theme}>
          <CssBaseline />
            {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
