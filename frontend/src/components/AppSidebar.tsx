"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, GitBranch, Target, LogOut, Sun, Moon, Code2, User } from "lucide-react";
import { useAuth } from "@/context/auth";
import { useTheme } from "@/context/theme";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard",          icon: LayoutDashboard },
  { label: "Repos",     href: "/dashboard/repos",    icon: GitBranch },
  { label: "Goals",     href: "/dashboard/goals",    icon: Target },
  { label: "Leetcode",  href: "/dashboard/leetcode", icon: Code2 },
  { label: "Profile",   href: "/dashboard/profile",  icon: User },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { logout } = useAuth();
  const { theme, toggleTheme, accent, toggleAccent } = useTheme();

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <div className="flex flex-col w-64 min-h-screen bg-base-200 border-r border-base-300 py-5">
      {/* Logo */}
      <div className="px-5 mb-7">
        <span className="font-mono text-xl font-black tracking-tight">
          <span className="text-base-content/25">&lt;</span>
          Shepherd
          <span className="text-base-content/25">&gt;</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col px-3 flex-1 gap-1">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive ? "" : "hover:bg-base-300/60"
              }`}
              style={isActive ? {
                background: "color-mix(in srgb, var(--game-accent) 14%, transparent)",
              } : undefined}
            >
              {/* Icon tile */}
              <span
                className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-all duration-200 ${
                  isActive ? "" : "bg-base-300"
                }`}
                style={isActive ? {
                  backgroundColor: "var(--game-accent)",
                  boxShadow: "0 0 16px color-mix(in srgb, var(--game-accent) 65%, transparent), 0 2px 6px rgba(0,0,0,0.25)",
                } : undefined}
              >
                <Icon
                  size={19}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={isActive ? "" : "text-base-content/45"}
                  style={isActive ? { color: "white" } : undefined}
                />
              </span>

              <span
                className={`text-sm font-bold transition-colors ${
                  isActive ? "" : "text-base-content/55"
                }`}
                style={isActive ? { color: "var(--game-accent)" } : undefined}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="divider my-2" />
      <div className="flex flex-col px-3 gap-0.5">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-base-content/50 hover:text-base-content hover:bg-base-300/60 transition-all text-sm font-semibold"
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <button
          onClick={toggleAccent}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-base-content/50 hover:text-base-content hover:bg-base-300/60 transition-all text-sm font-semibold"
        >
          <span
            className="h-4 w-4 rounded-full border border-base-content/20 shrink-0"
            style={{ backgroundColor: accent === "blue" ? "#f97316" : "#3b82f6" }}
          />
          {accent === "blue" ? "Orange theme" : "Blue theme"}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-error/60 hover:text-error hover:bg-error/10 transition-all text-sm font-semibold"
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </div>
  );
}
