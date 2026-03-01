import picomatch from "picomatch";

export interface ModelPolicyRule {
  allowed_paths: string[];
  blocked_paths: string[];
}

export interface ModelPolicyMap {
  [modelName: string]: ModelPolicyRule;
}

export interface ModelPolicyResult {
  allowed: boolean;
  blockedFiles: string[];
  reason?: string;
}

export function evaluateModelPolicy(
  modelName: string,
  filePaths: string[] | undefined,
  modelPolicies: ModelPolicyMap | undefined
): ModelPolicyResult {
  if (!modelPolicies || !filePaths || filePaths.length === 0) {
    return { allowed: true, blockedFiles: [] };
  }

  const rule = modelPolicies[modelName] ?? modelPolicies["default"];
  if (!rule) {
    return { allowed: true, blockedFiles: [] };
  }

  const blockedFiles: string[] = [];

  for (const fp of filePaths) {
    const normalised = fp.replace(/\\/g, "/");

    if (rule.blocked_paths.length > 0) {
      const isBlocked = rule.blocked_paths.some((pat) => picomatch.isMatch(normalised, pat));
      if (isBlocked) {
        blockedFiles.push(fp);
        continue;
      }
    }

    if (rule.allowed_paths.length > 0) {
      const isAllowed = rule.allowed_paths.some((pat) => picomatch.isMatch(normalised, pat));
      if (!isAllowed) {
        blockedFiles.push(fp);
      }
    }
  }

  if (blockedFiles.length > 0) {
    return {
      allowed: false,
      blockedFiles,
      reason: `Model "${modelName}" is not allowed to access: ${blockedFiles.join(", ")}`
    };
  }

  return { allowed: true, blockedFiles: [] };
}
