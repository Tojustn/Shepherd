export function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-100">
      <span className="loading loading-spinner loading-lg" style={{ color: "var(--game-accent)" }} />
    </div>
  );
}
