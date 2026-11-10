import { createFileRoute, redirect } from "@tanstack/react-router";

// Old #/dashboard links land on the home dashboard.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
