/**
 * Centralized app route paths.
 *
 * Every navigation target, redirect, and `<Link href>` should reference these
 * instead of hard-coding strings. The `/dashboard` prefix comes from the
 * `src/app/dashboard/` folder, whose shared layout wraps all of these sections.
 */
export const ROUTES = {
  home: "/",
  onboarding: "/onboarding",
  authCallback: "/auth/callback",
  dashboard: {
    root: "/dashboard",
    repos: "/dashboard/repos",
    goals: "/dashboard/goals",
    leetcode: "/dashboard/leetcode",
    profile: "/dashboard/profile",
  },
} as const;

/** `/onboarding?step=2` and friends. */
export const onboardingStep = (step: number) => `${ROUTES.onboarding}?step=${step}`;
