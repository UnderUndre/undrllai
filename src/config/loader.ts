/**
 * Config loader — reads orch.config.yaml, validates with Zod, merges global + local.
 * Global config: ~/.orch/config.yaml
 * Local config: ./orch.config.yaml (in project dir)
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";
import { orchConfigSchema, validateToolReferences } from "./schema.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { OrchConfig } from "../types.js";

const log = logger.child({ module: "config" });

const GLOBAL_CONFIG_DIR = join(homedir(), ".orch");
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, "config.yaml");

function readYamlFile(path: string): unknown {
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf-8");
  return parseYaml(raw);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export function loadConfig(projectDir?: string): OrchConfig {
  const globalRaw = readYamlFile(GLOBAL_CONFIG_PATH) as Record<string, unknown> | null;
  const localPath = projectDir ? join(projectDir, "orch.config.yaml") : null;
  const localRaw = localPath ? (readYamlFile(localPath) as Record<string, unknown> | null) : null;

  if (!globalRaw && !localRaw) {
    throw AppError.configNotFound(
      `No config found. Expected: ${GLOBAL_CONFIG_PATH} or ./orch.config.yaml`,
    );
  }

  const merged = globalRaw && localRaw
    ? deepMerge(globalRaw, localRaw)
    : globalRaw ?? localRaw;

  log.debug({ globalPath: GLOBAL_CONFIG_PATH, localPath, hasGlobal: !!globalRaw, hasLocal: !!localRaw }, "config sources");

  const parsed = orchConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw AppError.configInvalid(`Config validation failed:\n${issues.join("\n")}`, {
      issues,
    });
  }

  const refErrors = validateToolReferences(parsed.data);
  if (refErrors.length > 0) {
    throw AppError.configInvalid(
      `Config tool reference errors:\n${refErrors.join("\n")}`,
      { refErrors },
    );
  }

  log.info({ tools: Object.keys(parsed.data.tools) }, "config loaded");

  // Map validated config to OrchConfig (add name field to each tool)
  const tools: OrchConfig["tools"] = {};
  for (const [name, tool] of Object.entries(parsed.data.tools)) {
    tools[name] = { ...tool, name };
  }

  return {
    ...parsed.data,
    tools,
  };
}

export function getGlobalConfigDir(): string {
  return GLOBAL_CONFIG_DIR;
}

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_PATH;
}
