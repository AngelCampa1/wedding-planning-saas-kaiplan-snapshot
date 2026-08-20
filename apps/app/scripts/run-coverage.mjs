#!/usr/bin/env node
import fs, { promises as fsPromises } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const coverageRoot = path.join(appRoot, "coverage");
const coverageTmp = path.join(coverageRoot, ".tmp");

fs.rmSync(coverageRoot, { recursive: true, force: true });
fs.mkdirSync(coverageTmp, { recursive: true });

const originalRm = fsPromises.rm.bind(fsPromises);
const originalReadFile = fsPromises.readFile.bind(fsPromises);
const originalWriteFile = fsPromises.writeFile.bind(fsPromises);

fsPromises.rm = async (target, options) => {
  const targetPath = path.resolve(String(target));

  if (targetPath === coverageRoot || targetPath === coverageTmp) {
    fs.mkdirSync(coverageTmp, { recursive: true });
    return;
  }

  return originalRm(target, options);
};

fsPromises.writeFile = async (target, data, options) => {
  const targetPath = path.resolve(String(target));

  if (targetPath.startsWith(`${coverageTmp}${path.sep}`)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  return originalWriteFile(target, data, options);
};

fsPromises.readFile = async (target, options) => {
  const targetPath = path.resolve(String(target));

  if (!targetPath.startsWith(`${coverageTmp}${path.sep}`)) {
    return originalReadFile(target, options);
  }

  let lastError;

  for (let attempt = 0; attempt < 3000; attempt += 1) {
    try {
      return await originalReadFile(target, options);
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
};

syncBuiltinESMExports();

process.argv = [process.argv[0], "vitest", "run", "--coverage"];

await import("../node_modules/vitest/dist/cli.js");
