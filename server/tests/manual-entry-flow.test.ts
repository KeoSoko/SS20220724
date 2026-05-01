import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitialCategorySource, resolveReceiptSource, shouldRunAiCategorization } from "../receipt-flow-utils";

test("manual source resolves to user category source and skips AI", () => {
  const source = resolveReceiptSource("manual");
  assert.equal(source, "manual");
  assert.equal(resolveInitialCategorySource(source), "user");
  assert.equal(shouldRunAiCategorization(source), false);
});

test("scan source keeps AI categorization enabled", () => {
  const source = resolveReceiptSource("scan");
  assert.equal(source, "scan");
  assert.equal(resolveInitialCategorySource(source), "ai");
  assert.equal(shouldRunAiCategorization(source), true);
});

test("unknown source falls back to scan", () => {
  const source = resolveReceiptSource("something-else");
  assert.equal(source, "scan");
});
