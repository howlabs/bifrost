import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { readFileHandler } from "../src/handlers.js";
import { BifrostError } from "../src/errors.js";

test("readFileHandler tests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bifrost-read-file-"));
  const allowedDirs = [tempDir];

  // Set up test files
  const normalFile = path.join(tempDir, "normal.txt");
  const largeFile = path.join(tempDir, "large.txt");
  const binaryFile = path.join(tempDir, "binary.bin");
  const envFile = path.join(tempDir, ".env");
  const keyFile = path.join(tempDir, "id_rsa");

  await fs.writeFile(normalFile, "Hello Bifrost!");
  await fs.writeFile(envFile, "SECRET_KEY=123");
  await fs.writeFile(keyFile, "private key");

  // Create a large file (> 1MB)
  const largeHandle = await fs.open(largeFile, "w");
  await largeHandle.truncate(1024 * 1024 + 10); // 1MB + 10 bytes
  await largeHandle.close();

  // Create a binary file (contains null byte)
  const binaryBuffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
  await fs.writeFile(binaryFile, binaryBuffer);

  await t.test("should successfully read non-sensitive text files", async () => {
    const content = await readFileHandler({ path: normalFile }, allowedDirs);
    assert.strictEqual(content, "Hello Bifrost!");
  });

  await t.test("should throw INVALID_ARGUMENT if path is missing or not a string", async () => {
    await assert.rejects(
      readFileHandler({}, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "INVALID_ARGUMENT");
        return true;
      }
    );
  });

  await t.test("should throw PERMISSION_DENIED if path is outside allowedDirs", async () => {
    const outsidePath = path.resolve(tempDir, "..");
    await assert.rejects(
      readFileHandler({ path: outsidePath }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "PERMISSION_DENIED");
        return true;
      }
    );
  });

  await t.test("should throw NOT_FOUND for non-existent file", async () => {
    const nonExistent = path.join(tempDir, "missing.txt");
    await assert.rejects(
      readFileHandler({ path: nonExistent }, [nonExistent]),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_FOUND");
        return true;
      }
    );
  });

  await t.test("should throw NOT_SUPPORTED if path is a directory", async () => {
    await assert.rejects(
      readFileHandler({ path: tempDir }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_SUPPORTED");
        return true;
      }
    );
  });

  await t.test("should throw LIMIT_EXCEEDED if file is too large", async () => {
    await assert.rejects(
      readFileHandler({ path: largeFile }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "LIMIT_EXCEEDED");
        return true;
      }
    );
  });

  await t.test("should throw NOT_SUPPORTED if file is binary", async () => {
    await assert.rejects(
      readFileHandler({ path: binaryFile }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "NOT_SUPPORTED");
        return true;
      }
    );
  });

  await t.test("should throw SECURITY_ERROR for sensitive files (.env, credentials)", async () => {
    await assert.rejects(
      readFileHandler({ path: envFile }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "SECURITY_ERROR");
        return true;
      }
    );

    await assert.rejects(
      readFileHandler({ path: keyFile }, allowedDirs),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "SECURITY_ERROR");
        return true;
      }
    );
  });

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});
