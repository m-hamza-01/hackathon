import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <body className="min-h-full bg-white text-gray-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
