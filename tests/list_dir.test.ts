import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { listDirHandler } from "../src/handlers.js";
import { BifrostError } from "../src/errors.js";

test("listDirHandler tests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bifrost-list-dir-"));
  const allowedDirs = [tempDir];

  // Set up temporary files and folders
  const subDir = path.join(tempDir, "subdir");
  await fs.mkdir(subDir);
  await fs.writeFile(path.join(tempDir, "file1.txt"), "hello");
  await fs.writeFile(path.join(tempDir, ".env"), "SECRET=true"); // Should be filtered out
  const gitDir = path.join(tempDir, ".git");
  await fs.mkdir(gitDir); // Should be filtered out or blocked if trying to access directly

  await t.test("should successfully list non-sensitive files and directories", async () => {
    const result = await listDirHandler({ path: tempDir }, allowedDirs);
    const files = result.split("\n");
    assert.ok(files.includes("file1.txt"));
    assert.ok(files.includes("subdir"));
    assert.strictEqual(files.includes(".env"), false);
    assert.strictEqual(files.includes(".git"), false);
  });

  await t.test("should throw INVALID_ARGUMENT if path is missing or not a string", async () => {
    await assert.rejects(
      listDirHandler({}, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );
    await assert.rejects(
      listDirHandler({ path: 123 }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );
  });

  await t.test("should throw PERMISSION_DENIED if path is outside allowedDirs", async () => {
    const outsidePath = path.resolve(tempDir, "..");
    await assert.rejects(
      listDirHandler({ path: outsidePath }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "PERMISSION_DENIED");
        return true;
      }
    );
  });

  await t.test("should throw NOT_FOUND for non-existent path", async () => {
    const nonExistent = path.join(tempDir, "does-not-exist");
    await assert.rejects(
      listDirHandler({ path: nonExistent }, [nonExistent]), // set allowed to bypass permission check
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_FOUND");
        return true;
      }
    );
  });

  await t.test("should throw NOT_SUPPORTED if path is a file instead of directory", async () => {
    const filePath = path.join(tempDir, "file1.txt");
    await assert.rejects(
      listDirHandler({ path: filePath }, [filePath]),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_SUPPORTED");
        return true;
      }
    );
  });

  await t.test("should throw SECURITY_ERROR if path contains sensitive folder name (.git)", async () => {
    await assert.rejects(
      listDirHandler({ path: gitDir }, [gitDir]),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "SECURITY_ERROR");
        return true;
      }
    );
  });

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});
