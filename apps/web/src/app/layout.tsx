import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Casino (virtual chips)',
  description: 'Portfolio project. Virtual chips only, no real money.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // TODO(fase-1): header with balance, auth provider
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
