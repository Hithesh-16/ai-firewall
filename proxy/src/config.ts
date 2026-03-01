import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { PolicyConfig } from "./types";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(8080),
  PROVIDER_URL: z.string().url().default("https://api.openai.com/v1/chat/completions"),
  OPENAI_API_KEY: z.string().optional(),
  DB_PATH: z.string().default("./data/firewall.db"),
  MASTER_KEY: z.string().min(1).optional(),
  STRICT_LOCAL: z.coerce.boolean().default(false)
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

export const env = parsedEnv.data;

const POLICY_PATH = path.resolve(process.cwd(), "policy.json");

export function loadPolicyConfig(): PolicyConfig {
  const raw = fs.readFileSync(POLICY_PATH, "utf-8");
  const parsed = JSON.parse(raw) as PolicyConfig;
  return parsed;
}

export function isStrictLocal(): boolean {
  if (env.STRICT_LOCAL) return true;
  try {
    const policy = loadPolicyConfig();
    return !!policy.strict_local;
  } catch {
    return false;
  }
}

export function savePolicyConfig(policy: PolicyConfig): void {
  fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
}

export const policyPath = POLICY_PATH;
