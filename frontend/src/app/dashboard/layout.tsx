"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { Loading } from "@/components/Loading";
import { AppSidebar } from "@/components/AppSidebar";
import { Menu } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return <Loading />;

  return (
    <div className="drawer lg:drawer-open min-h-screen">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" />

      {/* Main content */}
      <div className="drawer-content flex flex-col min-h-screen bg-base-100">
        {/* Mobile-only top bar */}
        <div className="navbar lg:hidden bg-base-200 border-b border-base-300 px-2">
          <label htmlFor="app-drawer" className="btn btn-ghost btn-square btn-sm">
            <Menu size={18} />
          </label>
          <span className="font-mono font-bold text-sm ml-1">
            <span className="text-base-content/30">&lt;</span>
            Shepherd
            <span className="text-base-content/30">&gt;</span>
          </span>
        </div>
        {children}
      </div>

      {/* Sidebar */}
      <div className="drawer-side">
        <label htmlFor="app-drawer" aria-label="close sidebar" className="drawer-overlay" />
        <AppSidebar />
      </div>
    </div>
  );
}
