import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { isPathAllowed, isSensitivePath } from "../src/utils.js";
import { listDirHandler, readFileHandler } from "../src/handlers.js";
import { BifrostError } from "../src/errors.js";

test("Path Traversal and Security tests", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bifrost-security-"));
  const allowedDirs = [tempDir];

  // Set up mock directory structure
  const workspaceDir = path.join(tempDir, "workspace");
  await fs.mkdir(workspaceDir);

  const fileInside = path.join(workspaceDir, "index.ts");
  await fs.writeFile(fileInside, "console.log('hello');");

  // Create an outside secret file
  const secretOutside = path.join(tempDir, "secret.txt");
  await fs.writeFile(secretOutside, "super-secret-data");

  await t.test("isPathAllowed should correctly validate paths", async () => {
    // Inside is allowed
    assert.strictEqual(await isPathAllowed(workspaceDir, [workspaceDir]), true);
    assert.strictEqual(await isPathAllowed(fileInside, [workspaceDir]), true);

    // Outside is blocked
    assert.strictEqual(await isPathAllowed(secretOutside, [workspaceDir]), false);

    // Traversal attempt is blocked
    const traversalPath = path.join(workspaceDir, "..", "secret.txt");
    assert.strictEqual(await isPathAllowed(traversalPath, [workspaceDir]), false);
  });

  await t.test("isPathAllowed with empty allowedDirs should block everything", async () => {
    assert.strictEqual(await isPathAllowed(workspaceDir, []), false);
    assert.strictEqual(await isPathAllowed(fileInside, []), false);
  });

  await t.test("isSensitivePath should block sensitive files and folders", () => {
    const sensitiveFiles = [
      ".env",
      ".env.local",
      ".env.production",
      "id_rsa",
      "id_rsa.pub",
      "credentials",
      "secret.pem",
      "aws_credentials.json",
      "path/to/.git/config",
      "path/to/.ssh/authorized_keys"
    ];

    const normalFiles = [
      "index.ts",
      "package.json",
      "README.md",
      "env_config.ts",
      "pem_converter.py",
      "login_form.html"
    ];

    for (const f of sensitiveFiles) {
      assert.strictEqual(isSensitivePath(f), true, `Should classify ${f} as sensitive`);
    }

    for (const f of normalFiles) {
      assert.strictEqual(isSensitivePath(f), false, `Should not classify ${f} as sensitive`);
    }
  });

  await t.test("list_dir and read_file should block path traversal attempts", async () => {
    const traversalPath = path.join(workspaceDir, "..", "secret.txt");

    await assert.rejects(
      listDirHandler({ path: traversalPath }, [workspaceDir]),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "PERMISSION_DENIED");
        return true;
      }
    );

    await assert.rejects(
      readFileHandler({ path: traversalPath }, [workspaceDir]),
      (err: BifrostError) => {
        assert.strictEqual(err.code, "PERMISSION_DENIED");
        return true;
      }
    );
  });

  await t.test("should block symlink targets that point outside allowedDirs", async () => {
    // Only test symlinks if platform supports it or has permissions
    try {
      const symlinkPath = path.join(workspaceDir, "secret_link.txt");
      await fs.symlink(secretOutside, symlinkPath);

      // Verify listDirHandler filters it or isPathAllowed blocks it when reading
      await assert.rejects(
        readFileHandler({ path: symlinkPath }, [workspaceDir]),
        (err: BifrostError) => {
          // If realpath resolves it to secretOutside, it will be detected as outside workspaceDir
          assert.strictEqual(err.code, "PERMISSION_DENIED");
          return true;
        }
      );
    } catch (e: any) {
      // On Windows, symlink creation might fail due to privilege restrictions.
      // If so, we skip this test case.
      if (e.code !== "EPERM") {
        throw e;
      }
    }
  });

  // Cleanup
  await fs.rm(tempDir, { recursive: true, force: true });
});
