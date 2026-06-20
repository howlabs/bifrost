import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { getPlanHandler } from "../src/handlers.js";
import { BifrostError } from "../src/errors.js";

test("getPlanHandler tests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bifrost-get-plan-"));

  // Create mock plans
  const planName = "Test Get Plan";
  const safeName = "TestGetPlan";
  
  const contentV1 = "---\nversion: 1\n---\nPlan version 1";
  const contentV2 = "---\nversion: 2\n---\nPlan version 2";

  await fs.writeFile(path.join(tempDir, `${safeName}_v1.md`), contentV1);
  await fs.writeFile(path.join(tempDir, `${safeName}_v2.md`), contentV2);
  await fs.writeFile(path.join(tempDir, `${safeName}.md`), contentV2); // Latest points to V2

  await t.test("should retrieve the latest plan version by default", async () => {
    const content = await getPlanHandler({ name: planName }, tempDir);
    assert.ok(content.includes("Plan version 2"));
  });

  await t.test("should retrieve a specific version when requested", async () => {
    const contentV1Result = await getPlanHandler({ name: planName, version: 1 }, tempDir);
    assert.ok(contentV1Result.includes("Plan version 1"));

    const contentV2Result = await getPlanHandler({ name: planName, version: "2" }, tempDir);
    assert.ok(contentV2Result.includes("Plan version 2"));
  });

  await t.test("should throw NOT_FOUND if the plan or version does not exist", async () => {
    await assert.rejects(
      getPlanHandler({ name: "NonExistent" }, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_FOUND");
        return true;
      }
    );

    await assert.rejects(
      getPlanHandler({ name: planName, version: 99 }, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_FOUND");
        assert.ok(err.message.includes("version 99"));
        return true;
      }
    );
  });

  await t.test("should throw INVALID_ARGUMENT if plan name is missing or empty", async () => {
    await assert.rejects(
      getPlanHandler({}, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );
  });

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});
