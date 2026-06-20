import fs from "node:fs/promises";
import path from "node:path";
import { BifrostError } from "./errors.js";
import { ListDirArgs, ReadFileArgs, SavePlanArgs, GetPlanArgs } from "./types.js";
import {
  isPathAllowed,
  isSensitivePath,
  isBinaryFile,
  validatePlanContent,
  prependMetadata
} from "./utils.js";

export async function listDirHandler(args: unknown, allowedDirs: string[]): Promise<string> {
  if (!args || typeof args !== "object") {
    throw new BifrostError("INVALID_ARGUMENT", "Arguments must be an object");
  }
  const { path: dirPath } = args as ListDirArgs;
  if (typeof dirPath !== "string" || dirPath.trim() === "") {
    throw new BifrostError("INVALID_ARGUMENT", "Path must be a non-empty string");
  }

  const allowed = await isPathAllowed(dirPath, allowedDirs);
  if (!allowed) {
    throw new BifrostError(
      "PERMISSION_DENIED",
      `Access denied: Path '${dirPath}' is outside the allowed directories configured via BIFROST_ALLOWED_DIRS.`
    );
  }

  let realDirPath: string;
  try {
    realDirPath = await fs.realpath(dirPath);
  } catch {
    throw new BifrostError("NOT_FOUND", `Directory does not exist at path: '${dirPath}'`);
  }

  if (isSensitivePath(dirPath) || isSensitivePath(realDirPath)) {
    throw new BifrostError("SECURITY_ERROR", "Access denied: Path contains sensitive file or folder.");
  }

  let stat;
  try {
    stat = await fs.stat(realDirPath);
  } catch {
    throw new BifrostError("NOT_FOUND", `Directory does not exist at path: '${dirPath}'`);
  }
  if (!stat.isDirectory()) {
    throw new BifrostError("NOT_SUPPORTED", `Path '${dirPath}' is a file, not a directory.`);
  }

  const files = await fs.readdir(realDirPath);
  const allowedFiles = files.filter(file => {
    const fullFilePath = path.join(realDirPath, file);
    return !isSensitivePath(fullFilePath);
  });

  return allowedFiles.join("\n");
}

export async function readFileHandler(args: unknown, allowedDirs: string[]): Promise<string> {
  if (!args || typeof args !== "object") {
    throw new BifrostError("INVALID_ARGUMENT", "Arguments must be an object");
  }
  const { path: filePath } = args as ReadFileArgs;
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new BifrostError("INVALID_ARGUMENT", "Path must be a non-empty string");
  }

  const allowed = await isPathAllowed(filePath, allowedDirs);
  if (!allowed) {
    throw new BifrostError(
      "PERMISSION_DENIED",
      `Access denied: Path '${filePath}' is outside the allowed directories configured via BIFROST_ALLOWED_DIRS.`
    );
  }

  let realFilePath: string;
  try {
    realFilePath = await fs.realpath(filePath);
  } catch {
    throw new BifrostError("NOT_FOUND", `File does not exist at path: '${filePath}'`);
  }

  if (isSensitivePath(filePath) || isSensitivePath(realFilePath)) {
    throw new BifrostError("SECURITY_ERROR", "Access denied: Path contains sensitive file or folder.");
  }

  let stat;
  try {
    stat = await fs.stat(realFilePath);
  } catch {
    throw new BifrostError("NOT_FOUND", `File does not exist at path: '${filePath}'`);
  }
  if (stat.isDirectory()) {
    throw new BifrostError("NOT_SUPPORTED", `Path '${filePath}' is a directory, not a file.`);
  }

  if (stat.size > 1024 * 1024) {
    throw new BifrostError(
      "LIMIT_EXCEEDED",
      `Access denied: File size (${(stat.size / 1024).toFixed(1)} KB) exceeds the limit of 1 MB.`
    );
  }

  const binary = await isBinaryFile(realFilePath);
  if (binary) {
    throw new BifrostError("NOT_SUPPORTED", "Access denied: Binary files are not allowed.");
  }

  return await fs.readFile(realFilePath, "utf-8");
}

export async function savePlanHandler(
  args: unknown,
  plansDir: string
): Promise<{ message: string; version: number; path: string }> {
  if (!args || typeof args !== "object") {
    throw new BifrostError("INVALID_ARGUMENT", "Arguments must be an object");
  }
  const { name: planName, content } = args as SavePlanArgs;
  if (typeof planName !== "string" || planName.trim() === "") {
    throw new BifrostError("INVALID_ARGUMENT", "Plan name must be a non-empty string");
  }
  if (typeof content !== "string") {
    throw new BifrostError("INVALID_ARGUMENT", "Plan content must be a string");
  }

  const validation = validatePlanContent(content);
  if (!validation.valid) {
    throw new BifrostError(
      "VALIDATION_ERROR",
      `Plan is missing required sections: ${validation.missingSections.join(", ")}`
    );
  }

  const safeName = planName.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safeName === "") {
    throw new BifrostError(
      "INVALID_ARGUMENT",
      "Plan name must contain at least one alphanumeric character, underscore, or hyphen"
    );
  }

  await fs.mkdir(plansDir, { recursive: true });

  let nextVersion = 1;
  try {
    const files = await fs.readdir(plansDir);
    const versionRegex = new RegExp(`^${safeName}_v(\\d+)\\.md$`);
    for (const file of files) {
      const match = file.match(versionRegex);
      if (match) {
        const ver = parseInt(match[1], 10);
        if (ver >= nextVersion) {
          nextVersion = ver + 1;
        }
      }
    }
  } catch {
    // Directory or files lookup failed, assume version 1
  }

  const timestamp = new Date().toISOString();
  const contentWithMetadata = prependMetadata(content, planName, nextVersion, timestamp);

  const versionedPath = path.join(plansDir, `${safeName}_v${nextVersion}.md`);
  const latestPath = path.join(plansDir, `${safeName}.md`);

  await fs.writeFile(versionedPath, contentWithMetadata, "utf-8");
  await fs.writeFile(latestPath, contentWithMetadata, "utf-8");

  return {
    message: `Saved plan '${planName}' as version ${nextVersion}.`,
    version: nextVersion,
    path: latestPath
  };
}

export async function getPlanHandler(args: unknown, plansDir: string): Promise<string> {
  if (!args || typeof args !== "object") {
    throw new BifrostError("INVALID_ARGUMENT", "Arguments must be an object");
  }
  const { name: planName, version } = args as GetPlanArgs;
  if (typeof planName !== "string" || planName.trim() === "") {
    throw new BifrostError("INVALID_ARGUMENT", "Plan name must be a non-empty string");
  }

  const safeName = planName.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safeName === "") {
    throw new BifrostError(
      "INVALID_ARGUMENT",
      "Plan name must contain at least one alphanumeric character, underscore, or hyphen"
    );
  }

  let p: string;
  if (version !== undefined && version !== null && version !== "") {
    p = path.join(plansDir, `${safeName}_v${version}.md`);
  } else {
    p = path.join(plansDir, `${safeName}.md`);
  }

  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    if (version !== undefined && version !== null && version !== "") {
      throw new BifrostError("NOT_FOUND", `Plan '${planName}' version ${version} does not exist at path: ${p}`);
    } else {
      throw new BifrostError("NOT_FOUND", `Plan '${planName}' does not exist at path: ${p}`);
    }
  }
}
