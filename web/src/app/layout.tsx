import type { Metadata } from "next";
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
  title: "TaskScope",
  description: "Manager-side work-intelligence dashboard over Jira history.",
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
