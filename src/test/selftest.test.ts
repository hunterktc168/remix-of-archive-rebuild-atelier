import { describe, expect, it } from "vitest";
import { runSelftest } from "../dev/selftest";

describe("framework workspaces & validators selftest", () => {
  const results = runSelftest();

  for (const r of results) {
    it(r.name, () => {
      if (!r.passed) {
        throw new Error(r.error || "Test failed");
      }
      expect(r.passed).toBe(true);
    });
  }
});
