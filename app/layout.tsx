'use client' 

import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import { useNextcloudFrameSync } from './hooks/useNextcloudFrameSync';

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useNextcloudFrameSync();

  return (
    <html lang="en">
      <head>
        <title>
          Gaming
        </title>
      </head>
      <body className={inter.className}>
      <ThemeProvider theme={theme}>
          <CssBaseline />
            {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
