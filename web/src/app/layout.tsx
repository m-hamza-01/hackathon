import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const libreFranklin = Libre_Franklin({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const splineSansMono = Spline_Sans_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Foreman",
    template: "%s · Foreman",
  },
  description:
    "Who should take this task, how complex is it, how long will it take — answered from your team's real Jira history, with citations.",
  applicationName: "Foreman",
  openGraph: {
    title: "Foreman",
    description:
      "Work-intelligence dashboard over Jira history. Recommends with evidence — the manager decides.",
    siteName: "Foreman",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#151410",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${libreFranklin.variable} ${splineSansMono.variable} h-full`}
    >
      <body className="min-h-full" style={{ WebkitFontSmoothing: "antialiased" }}>
        {children}
      </body>
    </html>
  );
}
