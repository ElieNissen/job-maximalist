import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JobMAXIMALIST",
  description: "Agregateur local-first d'offres et de missions multi-sources",
  icons: {
    icon: {
      url: "/favicon.svg",
      type: "image/svg+xml"
    }
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
