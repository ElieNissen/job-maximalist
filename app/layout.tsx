import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Job Radar Design",
  description: "Agrégateur local d'offres UX/UI"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

