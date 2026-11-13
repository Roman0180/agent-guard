import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const siteDescription =
  "Governance and cost controls for your team's AI agents. Agent Sidecar runs inside your own cloud. It works with the models and frameworks you already use, and nothing leaves your environment.";

export const metadata: Metadata = {
  title: "Agent Sidecar — Governance and cost controls for your team's AI agents",
  description: siteDescription,
  openGraph: {
    title: "Agent Sidecar — Governance and cost controls for your team's AI agents",
    description: siteDescription,
    siteName: "Agent Sidecar"
  },
  twitter: {
    card: "summary",
    title: "Agent Sidecar — Governance and cost controls for your team's AI agents",
    description: siteDescription
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
