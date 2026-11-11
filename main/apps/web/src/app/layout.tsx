import React from 'react';
import type { Metadata } from 'next';
import '../styles/globals.css';
import { ToastProvider } from '../components/ui/Toast';

export const metadata: Metadata = {
  title: 'ExamGuard — Continuous Facial Identity Verification',
  description: 'Continuous facial identity verification system for secure online examinations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

