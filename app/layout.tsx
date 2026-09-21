import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { getPublicSupabaseConfig } from '@/src/client/public-config.js';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'XVfinance',
  description: 'Split-screen chat + workspace for investment managers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  getPublicSupabaseConfig(process.env);
  return (
    <html lang="en">
      <body className={`${inter.className} app-root antialiased`}>{children}</body>
    </html>
  );
}
