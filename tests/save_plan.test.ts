import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { savePlanHandler } from "../src/handlers.js";
import { BifrostError } from "../src/errors.js";

test("savePlanHandler tests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bifrost-save-plan-"));

  const validPlanContent = `
# Project Plan: Bifrost

## Overview
This is a local bridge server.

## Tech Stack
TypeScript, Node, MCP SDK

## Folder Structure
- src/
- tests/

## Steps
1. Refactor server.
2. Add validation.
`;

  const invalidPlanContent = `
# Project Plan: Bifrost

## Overview
This is a local bridge server.

## Folder Structure
- src/
- tests/
`; // Missing Tech Stack and Steps

  await t.test("should successfully save a valid plan with metadata and versioning", async () => {
    const res = await savePlanHandler({ name: "My Plan", content: validPlanContent }, tempDir);
    assert.strictEqual(res.version, 1);
    assert.ok(res.message.includes("version 1"));

    // Check versioned file
    const versionedFile = path.join(tempDir, "MyPlan_v1.md");
    const latestFile = path.join(tempDir, "MyPlan.md");

    const contentV1 = await fs.readFile(versionedFile, "utf-8");
    const contentLatest = await fs.readFile(latestFile, "utf-8");

    assert.strictEqual(contentV1, contentLatest);
    assert.ok(contentV1.includes("plan_name: My Plan"));
    assert.ok(contentV1.includes("version: 1"));
    assert.ok(contentV1.includes("timestamp:"));
    assert.ok(contentV1.includes("## Overview"));
  });

  await t.test("should increment version on consecutive saves", async () => {
    // Save version 2
    const res2 = await savePlanHandler({ name: "My Plan", content: validPlanContent }, tempDir);
    assert.strictEqual(res2.version, 2);

    const versionedFile2 = path.join(tempDir, "MyPlan_v2.md");
    const latestFile = path.join(tempDir, "MyPlan.md");

    const contentV2 = await fs.readFile(versionedFile2, "utf-8");
    const contentLatest = await fs.readFile(latestFile, "utf-8");

    assert.strictEqual(contentV2, contentLatest);
    assert.ok(contentV2.includes("version: 2"));
  });

  await t.test("should merge with existing frontmatter metadata", async () => {
    const contentWithFrontmatter = `---
author: Antigravity
custom_field: test-value
---
# Overview
Some overview content.
# Tech Stack
TS
# Folder Structure
- src/
# Steps
1. Test.
`;
    const res = await savePlanHandler({ name: "My Plan", content: contentWithFrontmatter }, tempDir);
    const contentV3 = await fs.readFile(path.join(tempDir, `MyPlan_v${res.version}.md`), "utf-8");

    assert.ok(contentV3.includes("author: Antigravity"));
    assert.ok(contentV3.includes("custom_field: test-value"));
    assert.ok(contentV3.includes(`version: ${res.version}`));
  });

  await t.test("should throw VALIDATION_ERROR if sections are missing", async () => {
    await assert.rejects(
      savePlanHandler({ name: "Invalid Plan", content: invalidPlanContent }, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "VALIDATION_ERROR");
        assert.ok(err.message.includes("Tech Stack"));
        assert.ok(err.message.includes("Steps"));
        return true;
      }
    );
  });

  await t.test("should throw INVALID_ARGUMENT for missing/invalid plan name or content", async () => {
    await assert.rejects(
      savePlanHandler({ name: "", content: validPlanContent }, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );

    await assert.rejects(
      savePlanHandler({ name: "Test", content: 123 as any }, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );

    await assert.rejects(
      savePlanHandler({ name: "???", content: validPlanContent }, tempDir),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );
  });

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});
