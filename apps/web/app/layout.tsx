import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "gradesign. — Your open design studio",
  description:
    "Your open design studio. Create, compose, and make something worth sharing.",
  referrer: "no-referrer",
  applicationName: "gradesign.",
  icons: {
    icon: [
      { url: (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/favicon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/favicon-32.png",
    apple: [{ url: (process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/favicon-180.png", type: "image/png", sizes: "180x180" }],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
