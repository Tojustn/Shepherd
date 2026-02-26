"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/context/theme";
import { useAuth } from "@/context/auth";

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, logout } = useAuth();

  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === "/";

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 border-b border-base-200 bg-base-100/80 backdrop-blur-sm">
      <Link href="/">
        <Image
          src={theme === "light" ? "/black-logo.svg" : "/white-logo.svg"}
          alt="Shepherd"
          width={64}
          height={30}
          priority
        />
      </Link>

      <nav className="flex items-center gap-6 text-sm font-medium text-base-content/60">
        {isHome && (
          <>
            <Link href="#features" className="hover:text-base-content transition-colors">
              Features
            </Link>
            <Link href="#about" className="hover:text-base-content transition-colors">
              About
            </Link>
          </>
        )}
        {isAuthenticated ? (
          <button onClick={handleLogout} className="btn btn-ghost btn-sm">
            Log out
          </button>
        ) : (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/github/login`}
            className="hover:text-base-content transition-colors"
          >
            Log in
          </a>
        )}

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="btn btn-ghost btn-square btn-sm"
        >
          {theme === "light" ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          )}
        </button>
      </nav>
    </header>
  );
}
