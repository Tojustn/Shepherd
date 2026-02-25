import { Navbar } from "@/components/Navbar";

export default function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-black">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold text-black dark:text-white">Dashboard</h1>
        <p className="mt-4 text-zinc-500 dark:text-zinc-400">Coming soon.</p>
      </main>
    </div>
  );
}
