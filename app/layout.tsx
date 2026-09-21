import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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
  // Do not assert public Supabase config here. A throw in the root layout
  // blanks the shell; AuthGate already surfaces missing/invalid public env.
  return (
    <html lang="en">
      <body className={`${inter.className} app-root antialiased`}>{children}</body>
    </html>
  );
}
