import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { ThemeProvider } from "@/context/theme";
import { AuthProvider } from "@/context/auth";
import { QueryProvider } from "@/context/query";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: "Shepherd",
  description: "Level up your coding. Earn XP from commits and LeetCode solves, track streaks, and hit goals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${nunito.className} antialiased`}>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}