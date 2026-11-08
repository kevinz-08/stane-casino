import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionHeader } from '@/components/session-header';
import './globals.css';

export const metadata: Metadata = {
  title: 'Casino (virtual chips)',
  description: 'Portfolio project. Virtual chips only, no real money.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <SessionHeader />
        {children}
      </body>
    </html>
  );
}
