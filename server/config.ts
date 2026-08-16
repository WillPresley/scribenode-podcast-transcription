import fs from "fs";
import path from "path";

export interface BasicAuthCredentials {
  enabled: boolean;
  user: string;
  pass: string;
  reason: string;
}

export const getAppVersion = (): string => {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.version) return pkg.version;
    }
  } catch {}
  return "1.2.0";
};

export const cleanEnvString = (val: string | undefined): string => {
  if (!val) return "";
  let s = val.trim();
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
};

export const parseBooleanEnv = (val: string | undefined, defaultVal = false): boolean => {
  if (!val) return defaultVal;
  const raw = cleanEnvString(val).toLowerCase();
  if (["true", "1", "yes", "enabled", "on"].includes(raw)) return true;
  if (["false", "0", "no", "disabled", "off"].includes(raw)) return false;
  return defaultVal;
};

export const isDisableDefaultItems = (env = process.env): boolean => {
  return parseBooleanEnv(env.DISABLE_DEFAULT_ITEMS, false);
};

export const DEFAULT_MAX_UPLOAD_SIZE_MB = 100;

export const getMaxUploadSizeMB = (env = process.env): number => {
  const raw = cleanEnvString(
    env.MAX_UPLOAD_SIZE_MB ||
    env.MAX_FILE_SIZE_MB ||
    env.MAX_UPLOAD_SIZE ||
    env.MAX_UPLOAD_MB ||
    env.MAX_FILE_MB
  );
  if (!raw) return DEFAULT_MAX_UPLOAD_SIZE_MB;

  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return DEFAULT_MAX_UPLOAD_SIZE_MB;
  }
  return parsed;
};

export const getMaxUploadSizeBytes = (env = process.env): number => {
  return getMaxUploadSizeMB(env) * 1024 * 1024;
};

export const getBasicAuthCredentials = (env = process.env): BasicAuthCredentials => {
  const rawEnableFlag = cleanEnvString(env.BASIC_AUTH_ENABLED || env.ENABLE_BASIC_AUTH).toLowerCase();
  const rawDisableFlag = cleanEnvString(env.DISABLE_BASIC_AUTH).toLowerCase();

  // 1. Explicit disable flag
  if (["true", "1", "yes", "enabled", "on"].includes(rawDisableFlag)) {
    return { enabled: false, user: "", pass: "", reason: "DISABLE_BASIC_AUTH is set to true" };
  }

  // 2. Strict Opt-In requirement: BASIC_AUTH_ENABLED must be explicitly set to 'true'
  const isExplicitlyEnabled = ["true", "1", "yes", "enabled", "on"].includes(rawEnableFlag);
  if (!isExplicitlyEnabled) {
    return {
      enabled: false,
      user: "",
      pass: "",
      reason: "BASIC_AUTH_ENABLED is not set to 'true' (defaults to FULLY DISABLED)"
    };
  }

  // 3. Validate user and password credentials
  const user = cleanEnvString(env.BASIC_AUTH_USER);
  const pass = cleanEnvString(env.BASIC_AUTH_PASS);

  if (!user || !pass) {
    return {
      enabled: false,
      user: "",
      pass: "",
      reason: "BASIC_AUTH_ENABLED is 'true', but BASIC_AUTH_USER or BASIC_AUTH_PASS is missing or empty"
    };
  }

  const invalidTokens = [
    "",
    "null",
    "undefined",
    "none",
    "disabled",
    "false",
    "off",
    "0",
    "unset",
    "$basic_auth_user",
    "${basic_auth_user}",
    "$basic_auth_pass",
    "${basic_auth_pass}",
    "your_secure_password_here"
  ];

  if (invalidTokens.includes(user.toLowerCase()) || invalidTokens.includes(pass.toLowerCase())) {
    return {
      enabled: false,
      user: "",
      pass: "",
      reason: `Placeholder or invalid token detected ("${user}" / "${pass}")`
    };
  }

  return { enabled: true, user, pass, reason: "Explicitly enabled via BASIC_AUTH_ENABLED=true" };
};

export const formatDockerTag = (
  tag = "latest",
  rawSha = ""
): string => {
  if (!rawSha) return tag;
  const trimmed = rawSha.trim();
  if (trimmed.startsWith("sha256:")) {
    return `${tag} (${trimmed.substring(0, 19)})`;
  } else if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return `${tag} (sha256: ${trimmed.substring(0, 12)})`;
  } else if (/^[a-f0-9]{40}$/i.test(trimmed)) {
    return `${tag} (sha: ${trimmed.substring(0, 8)})`;
  }
  return `${tag} (${trimmed})`;
};
