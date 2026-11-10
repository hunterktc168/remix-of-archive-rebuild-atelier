import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Every path the original Boardroom hash router served must match a real page.
describe("Boardroom routes", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  const leaf = (path: string) => router.matchRoutes(path).at(-1)?.routeId;

  it.each([
    ["/", "/"],
    ["/agents", "/agents"],
    ["/settings", "/settings"],
    ["/venture/v_1/boardroom", "/venture/$ventureId/$tab"],
    ["/venture/v_1/deliverables", "/venture/$ventureId/$tab"],
    ["/venture/v_1/phase/validation", "/venture/$ventureId/phase/$phase"],
    ["/venture/v_1", "/venture/$ventureId/"],
  ])("%s matches %s", (path, routeId) => {
    expect(leaf(path)).toBe(routeId);
    expect(leaf(path)).not.toBe(rootRouteId);
  });
});
