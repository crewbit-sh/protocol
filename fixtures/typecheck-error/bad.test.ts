/**
 * protocol#2: a fixture kept broken on purpose, checked by nothing on its
 * own - `typecheck.test.ts` points `tsc` at it through its own tsconfig and
 * asserts the error, which is the regression this proves stays caught.
 */
import type { JobEvent } from "../../src/types.ts";

// A real `tool_result` variant missing the `isError` field it requires -
// the exact shape of value the issue's Fact names having compiled once.
export const event: JobEvent = { t: "tool_result", text: "ok" };
