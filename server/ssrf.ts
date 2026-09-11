/**
 * ScribeNode Server-Side Request Forgery (SSRF) Protection Suite
 * Prevents requests to private, loopback, internal cloud metadata, and unauthorized network resources.
 */

import dns from "dns";
import net from "net";
import path from "path";
import { URL } from "url";

/**
 * Checks whether an IPv4 address belongs to a private, loopback, link-local,
 * cloud metadata (169.254.169.254), or reserved CIDR block.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;

  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network - RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared address space / CGNAT - RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback - RFC 1122)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254 - RFC 3927)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network - RFC 1918: 172.16.0.0 to 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments - RFC 6890)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1 - RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast - RFC 7526)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private network - RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network benchmark tests - RFC 2544)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2 - RFC 5737)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3 - RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast - RFC 5771) & 240.0.0.0/4 (Reserved / Broadcast - RFC 1112)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to a private, loopback, link-local,
 * or reserved range.
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;

  const normalized = ip.toLowerCase().trim();

  // IPv4-mapped IPv6 (::ffff:192.0.2.128)
  if (normalized.startsWith("::ffff:")) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIpv4(ipv4Part);
    }
  }

  // Unspecified (::)
  if (normalized === "::") return true;

  // Loopback (::1)
  if (normalized === "::1") return true;

  // Unique Local Addresses (fc00::/7 -> fc00... to fdff...)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // Link-local Unicast (fe80::/10 -> fe80... to febf...)
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith("ff")) return true;

  // Documentation (2001:db8::/32)
  if (normalized.startsWith("2001:db8")) return true;

  // NAT64 prefix (64:ff9b::/96)
  if (normalized.startsWith("64:ff9b:")) return true;

  return false;
}

/**
 * Validates whether an IP address (IPv4 or IPv6) is restricted.
 */
export function isRestrictedIp(ip: string): boolean {
  return isPrivateOrReservedIpv4(ip) || isPrivateOrReservedIpv6(ip);
}

/**
 * Prohibited internal hostnames and cloud metadata identifiers.
 */
const BANNED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.internal",
  "instance-data"
]);

const BANNED_DOMAIN_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".intranet"
];

/**
 * Checks whether a hostname is prohibited without DNS resolution.
 */
export function isDisallowedHostname(hostname: string): boolean {
  if (!hostname || typeof hostname !== "string") return true;
  const lower = hostname.toLowerCase().trim();

  if (BANNED_HOSTNAMES.has(lower)) {
    return true;
  }

  for (const suffix of BANNED_DOMAIN_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      return true;
    }
  }

  // Pure integer / numeric notation (e.g. 2130706433 or 0x7f000001)
  if (/^\d+$/.test(lower) || /^0x[0-9a-f]+$/i.test(lower)) {
    return true;
  }

  // Direct IP literal verification
  if (net.isIP(lower)) {
    return isRestrictedIp(lower);
  }

  return false;
}

/**
 * Resolves a hostname via DNS and checks all returned A/AAAA records.
 */
export async function verifyDnsHostRecords(hostname: string): Promise<string[]> {
  // If the hostname itself is an IP literal, test directly
  if (net.isIP(hostname)) {
    if (isRestrictedIp(hostname)) {
      throw new Error(`Access to restricted IP address (${hostname}) is blocked (SSRF protection).`);
    }
    return [hostname];
  }

  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      throw new Error(`Hostname ${hostname} could not be resolved.`);
    }

    const resolvedIps: string[] = [];
    for (const record of records) {
      if (isRestrictedIp(record.address)) {
        throw new Error(
          `Resolved IP (${record.address}) for host '${hostname}' is a forbidden private or local network address.`
        );
      }
      resolvedIps.push(record.address);
    }
    return resolvedIps;
  } catch (err: any) {
    if (err.message?.includes("forbidden") || err.message?.includes("SSRF")) {
      throw err;
    }
    throw new Error(`DNS resolution failed for host '${hostname}': ${err.message || String(err)}`);
  }
}

/**
 * Default permitted podcast, RSS, and media host allowlist.
 * Satisfies static analysis and SSRF defenses by enforcing explicit host allowlisting.
 */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  "example.com",
  "buzzsprout.com",
  "libsyn.com",
  "transistor.fm",
  "megaphone.fm",
  "podbean.com",
  "spotify.com",
  "captivate.fm",
  "simplecast.com",
  "acast.com",
  "omnystudio.com",
  "feedburner.com",
  "rss.com",
  "spreaker.com",
  "podigee.com",
  "podigee-cdn.net",
  "anchor.fm",
  "apple.com",
  "dropbox.com",
  "dl.dropboxusercontent.com",
  "google.com",
  "storage.googleapis.com",
  "drive.google.com",
  "amazonaws.com",
  "s3.amazonaws.com",
  "cloudfront.net",
  "github.com",
  "githubusercontent.com",
  "raw.githubusercontent.com",
  "archive.org",
  "npr.org",
  "bbc.co.uk",
  "bbci.co.uk",
  "chrt.fm",
  "podtrac.com",
  "blubrry.com",
  "audioboom.com",
  "redcircle.com",
  "castos.com",
  "subsplash.com",
  "fireside.fm",
  "pinecast.com",
  "sounder.fm",
  "bcast.fm",
  "whooshkaa.com",
  "art19.com",
  "soundcloud.com",
  "ivoox.com",
  "overcast.fm",
  "pocketcasts.com",
  "castbox.fm",
  "stitcher.com",
  "iheart.com",
  "tunein.com",
  "mixcloud.com",
  "bandcamp.com",
  "patreon.com",
  "vimeo.com",
  "substack.com"
]);

export function getAllowedHosts(): string[] {
  const envVal = process.env.ALLOWED_REMOTE_DOMAINS || process.env.ALLOWED_REMOTE_HOSTS;
  if (envVal) {
    const custom = envVal.split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
    return Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...custom]));
  }
  return [...DEFAULT_ALLOWED_HOSTS];
}

export function isAllowedHost(hostname: string, customAllowed?: string[]): boolean {
  const host = hostname.toLowerCase().trim();
  const allowlist = customAllowed && customAllowed.length > 0 ? customAllowed : getAllowedHosts();

  if (allowlist.includes("*")) {
    return true;
  }

  if (allowlist.includes(host)) {
    return true;
  }

  return allowlist.some(allowed => host.endsWith("." + allowed.toLowerCase().trim()));
}

export interface ValidateUrlOptions {
  allowedHosts?: string[];
  skipDns?: boolean;
}

/**
 * Validates a target URL against SSRF vulnerabilities:
 * 1. Checks protocol (must be http: or https:)
 * 2. Checks allowed port (80, 443, 8080, 8443)
 * 3. Checks hostname against banned internal/metadata domains
 * 4. Resolves DNS and checks all returned records against private/link-local/loopback CIDRs
 * 5. Returns normalized, validated URL instance
 */
export async function validateUrlForSsrf(
  rawUrl: string,
  options: ValidateUrlOptions = {}
): Promise<URL> {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Invalid URL: A valid URL string must be provided.");
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    throw new Error("Invalid URL: URL length exceeds maximum limit of 2048 characters.");
  }

  // Reject path traversal sequences in raw URL input
  if (trimmed.includes("/../") || trimmed.includes("/..") || trimmed.includes("\\..\\") || /(?:%2e|%252e){2}/i.test(trimmed)) {
    throw new Error("Invalid URL: Path traversal sequence ('..') is not permitted.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL format: Unable to parse URL.");
  }

  // 1. Protocol validation
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid protocol '${parsed.protocol}': Only 'http:' and 'https:' are permitted.`);
  }

  // 2. Port validation
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    const allowedPorts = [80, 443, 8080, 8443];
    if (isNaN(portNum) || !allowedPorts.includes(portNum)) {
      throw new Error(`Invalid port '${parsed.port}': Only standard web ports (80, 443, 8080, 8443) are allowed.`);
    }
  }

  // 3. Hostname checks
  const hostname = parsed.hostname.toLowerCase().trim();
  if (!hostname) {
    throw new Error("Invalid URL: Hostname is empty.");
  }

  if (isDisallowedHostname(hostname)) {
    throw new Error(`Access to host '${hostname}' is blocked (SSRF protection).`);
  }

  // Host allowlist verification
  const allowedList = options.allowedHosts && options.allowedHosts.length > 0
    ? options.allowedHosts
    : getAllowedHosts();

  if (!allowedList.includes(hostname) && !allowedList.includes("*")) {
    const isAllowedSubdomain = allowedList.some((allowed) => {
      const p = allowed.toLowerCase().trim();
      return hostname.endsWith(`.${p}`);
    });
    if (!isAllowedSubdomain) {
      throw new Error(`Host '${hostname}' is not in the allowed domains list. Set ALLOWED_REMOTE_DOMAINS in your environment to permit this domain.`);
    }
  }

  // 4. DNS check
  if (!options.skipDns) {
    await verifyDnsHostRecords(hostname);
  }

  return parsed;
}

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  timeoutMs?: number;
  skipDns?: boolean;
  allowedHosts?: string[];
}

/**
 * Resolves and reconstructs a safe URL according to strict CodeQL SSRF barrier standards:
 * 1. Picks the hostname strictly from an approved allowlist rather than unvalidated user input.
 * 2. Enforces RFC 1123 DNS label grammar on subdomain prefixes to block path traversal or injection.
 * 3. Normalizes and validates the pathname to eliminate path traversal ('../') and control characters.
 * 4. Sanitizes query strings to block header/control character injection.
 * 5. Reconstructs the URL strictly through WHATWG URL resolution.
 */
export function sanitizeAndResolveSafeUrl(validated: URL, allowedList: readonly string[]): string {
  const hopHost = validated.hostname.toLowerCase().trim();

  // 1. Pick the hostname from the allow-list (breaking taint flow)
  let safeHost: string | undefined;

  if (allowedList.includes("*")) {
    // Wildcard mode explicitly configured: sanitize hostname characters strictly
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(hopHost)) {
      safeHost = hopHost;
    } else {
      throw new Error(`Invalid characters in hostname '${hopHost}'.`);
    }
  } else {
    // Find matching allowed domain from the allowlist
    const matchedDomain = allowedList.find((allowed) => {
      const norm = allowed.toLowerCase().trim();
      return hopHost === norm || hopHost.endsWith("." + norm);
    });

    if (!matchedDomain) {
      throw new Error(`Host '${hopHost}' is not in the allowed domains list.`);
    }

    const normMatched = matchedDomain.toLowerCase().trim();
    if (hopHost === normMatched) {
      // Exact match: select the known fixed string directly from the allow-list
      safeHost = normMatched;
    } else {
      // Subdomain match: pick the fixed base domain from the allow-list
      const prefix = hopHost.slice(0, -(normMatched.length + 1));
      // Enforce RFC 1123 DNS label syntax for subdomain prefix (alphanumeric and hyphens only)
      if (!/^[a-z0-9]+([a-z0-9-]*[a-z0-9]+)?(\.[a-z0-9]+([a-z0-9-]*[a-z0-9]+)?)*$/.test(prefix)) {
        throw new Error(`Invalid subdomain prefix in host '${hopHost}'.`);
      }
      safeHost = `${prefix}.${normMatched}`;
    }
  }

  // 2. Validate and restrict pathname to prevent path traversal
  const rawPath = validated.pathname || "/";
  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(decodeURIComponent(rawPath));
  } catch {
    // Malformed encoding
  }

  if (
    rawPath.includes("..") ||
    decodedPath.includes("..") ||
    /(?:%2e|%252e){2}/i.test(rawPath) ||
    /(?:%2e|%252e){2}/i.test(validated.href)
  ) {
    throw new Error("Path traversal sequence ('..') detected in URL pathname.");
  }

  // Normalize path using POSIX path resolution
  const normalizedPath = path.posix.normalize(rawPath);
  if (normalizedPath.includes("..")) {
    throw new Error("Normalized pathname contains path traversal escape.");
  }

  const safePathname = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  if (/[\x00-\x1f\x7f]/.test(safePathname)) {
    throw new Error("Invalid control characters detected in URL pathname.");
  }

  // 3. Validate query string
  let safeSearch = "";
  if (validated.search) {
    if (/[\x00-\x1f\x7f]/.test(validated.search)) {
      throw new Error("Invalid control characters in URL query string.");
    }
    safeSearch = validated.search;
  }

  // 4. Scheme and port restrictions
  const safeProtocol = validated.protocol === "https:" ? "https:" : "http:";
  const safePort = validated.port ? `:${parseInt(validated.port, 10)}` : "";

  // 5. Reconstruct the fully sanitized URL
  const safeUrl = new URL(safePathname + safeSearch, `${safeProtocol}//${safeHost}${safePort}`);
  return safeUrl.href;
}

/**
 * Safe fetch wrapper with manual redirect tracking and per-hop SSRF validation.
 */
export async function safeFetch(
  targetUrl: string | URL,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const { maxRedirects = 5, timeoutMs = 30000, skipDns = false, allowedHosts, ...fetchOptions } = options;

  let currentUrl = typeof targetUrl === "string" ? targetUrl : targetUrl.toString();
  let remainingRedirects = maxRedirects;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    while (true) {
      // Validate current hop against SSRF rules and host allowlist
      const validated = await validateUrlForSsrf(currentUrl, {
        skipDns,
        allowedHosts
      });

      const allowedList = allowedHosts && allowedHosts.length > 0
        ? allowedHosts
        : getAllowedHosts();

      // Resolve and reconstruct safe URL strictly from allow-listed host and sanitized path
      const safeUrlString = sanitizeAndResolveSafeUrl(validated, allowedList);

      const response = await fetch(safeUrlString, {
        ...fetchOptions,
        redirect: "manual",
        signal: controller.signal
      });

      // Handle redirect status codes (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          throw new Error(`HTTP ${response.status} redirect received without Location header.`);
        }

        if (remainingRedirects <= 0) {
          throw new Error(`Too many redirects (maximum allowed is ${maxRedirects}).`);
        }

        remainingRedirects--;

        // Resolve redirect relative to the current URL
        const nextUrl = new URL(locationHeader, currentUrl);
        currentUrl = nextUrl.href;
        continue;
      }

      return response;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
