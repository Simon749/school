import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from 'sonner';
import './globals.css';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'EduTrack Kenya',
  description: 'CBC-native school management platform for Nairobi private schools',
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" className={cn('font-sans', inter.variable)}>
        <body className="font-sans antialiased">
          {children}
          <Toaster richColors position="top-right" closeButton />
        </body>
      </html>
    </ClerkProvider>
  );
}