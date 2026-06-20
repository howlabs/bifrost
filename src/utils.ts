import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export function getAllowedDirs(envVal?: string): string[] {
  const allowedDirsEnv = envVal !== undefined ? envVal : (process.env.BIFROST_ALLOWED_DIRS || "");
  return allowedDirsEnv
    .split(process.platform === "win32" ? /[;,]/ : /[:,]/)
    .map(d => d.trim())
    .filter(d => d.length > 0)
    .map(d => {
      try {
        return fsSync.realpathSync(d);
      } catch {
        return path.resolve(d);
      }
    });
}

export async function isPathAllowed(targetPath: string, allowedDirs: string[]): Promise<boolean> {
  if (allowedDirs.length === 0) {
    return false;
  }

  let resolvedTarget: string;
  try {
    resolvedTarget = await fs.realpath(targetPath);
  } catch {
    resolvedTarget = path.resolve(targetPath);
  }
  const isWindows = process.platform === "win32";

  return allowedDirs.some((allowedDir) => {
    const targetToCheck = isWindows ? resolvedTarget.toLowerCase() : resolvedTarget;
    const allowedToCheck = isWindows ? allowedDir.toLowerCase() : allowedDir;

    if (targetToCheck === allowedToCheck) {
      return true;
    }

    const prefix = allowedToCheck.endsWith(path.sep) ? allowedToCheck : allowedToCheck + path.sep;
    return targetToCheck.startsWith(prefix);
  });
}

export function isSensitivePath(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1];

  // Block sensitive directory names
  const hasSensitiveDir = parts.some(part => part === ".git" || part === ".ssh");
  if (hasSensitiveDir) {
    return true;
  }

  // Block sensitive files
  const lowerFileName = fileName.toLowerCase();
  if (
    lowerFileName === ".env" ||
    lowerFileName.startsWith(".env.") ||
    lowerFileName.endsWith(".pem") ||
    lowerFileName.includes("id_rsa") ||
    lowerFileName.includes("credentials")
  ) {
    return true;
  }

  return false;
}

export async function isBinaryFile(filePath: string): Promise<boolean> {
  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(512);
    const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

export function validatePlanContent(content: string): { valid: boolean; missingSections: string[] } {
  const overviewRegex = /^\s*#+\s*(?:\d+\.?\s*)?overview\b/mi;
  const stackRegex = /^\s*#+\s*(?:\d+\.?\s*)?(?:tech\s+)?stack\b/mi;
  const structureRegex = /^\s*#+\s*(?:\d+\.?\s*)?(?:folder\s+)?structure\b/mi;
  const stepsRegex = /^\s*#+\s*(?:\d+\.?\s*)?(?:implementation\s+|action\s+|step-by-step\s*)?steps\b|^\s*#+\s*(?:\d+\.?\s*)?step-by-step\b/mi;

  const missingSections: string[] = [];
  if (!overviewRegex.test(content)) {
    missingSections.push("Overview");
  }
  if (!stackRegex.test(content)) {
    missingSections.push("Tech Stack");
  }
  if (!structureRegex.test(content)) {
    missingSections.push("Folder Structure");
  }
  if (!stepsRegex.test(content)) {
    missingSections.push("Steps");
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
  };
}

export function prependMetadata(content: string, name: string, version: number, timestamp: string): string {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(frontmatterRegex);
  let body = content;
  let existingMetadata: Record<string, string> = {};
  
  if (match) {
    body = content.replace(frontmatterRegex, "");
    const yamlLines = match[1].split(/\r?\n/);
    for (const line of yamlLines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        const val = line.substring(colonIndex + 1).trim();
        existingMetadata[key] = val;
      }
    }
  }
  
  // Update/merge metadata
  existingMetadata["plan_name"] = name;
  existingMetadata["version"] = String(version);
  existingMetadata["timestamp"] = timestamp;

  const frontmatter = [
    "---",
    ...Object.entries(existingMetadata).map(([k, v]) => `${k}: ${v}`),
    "---",
    ""
  ].join("\n");

  return frontmatter + body;
}
