import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // protocol#2: `fixtures/typecheck-error/bad.test.ts` is kept broken on
    // purpose - `tsc` is what has to fail on it, not vitest, which would
    // otherwise collect it as a suite with nothing in it and fail the run
    // for an unrelated reason.
    exclude: ["**/node_modules/**", "fixtures/**"],
  },
});
