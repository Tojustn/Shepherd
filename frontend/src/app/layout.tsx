import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/context/theme";
import { AuthProvider } from "@/context/auth";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shepherd",
  description: "Your personal developer command center.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geist.className} antialiased`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
