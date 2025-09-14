// app/layout.tsx
import type { Metadata } from "next";
// WICHTIG: Pfad zur CSS richtig setzen – liegt bei dir unter /styles/globals.css
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "AI-Rezeptplattform",
  description: "Zutaten rein, Rezept raus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        {children}
        <footer className="text-center text-xs text-slate-500 mt-10 mb-6">
          © {new Date().getFullYear()} Joel Harder • All rights reserved • Version v4.6.1
        </footer>
      </body>
    </html>
  );
}
