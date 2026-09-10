import { describe, it, expect, vi } from "vitest";
import {
  isPrivateOrReservedIpv4,
  isPrivateOrReservedIpv6,
  isRestrictedIp,
  isDisallowedHostname,
  validateUrlForSsrf,
  safeFetch
} from "../../server/ssrf";

describe("SSRF Protection Suite", () => {
  describe("isPrivateOrReservedIpv4", () => {
    it("identifies private and loopback IPv4 addresses as restricted", () => {
      // Loopback
      expect(isPrivateOrReservedIpv4("127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("127.255.255.255")).toBe(true);

      // Cloud Metadata & Link-local
      expect(isPrivateOrReservedIpv4("169.254.169.254")).toBe(true);
      expect(isPrivateOrReservedIpv4("169.254.1.1")).toBe(true);

      // RFC 1918 Private ranges
      expect(isPrivateOrReservedIpv4("10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("10.255.255.255")).toBe(true);
      expect(isPrivateOrReservedIpv4("172.16.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("172.31.255.255")).toBe(true);
      expect(isPrivateOrReservedIpv4("192.168.1.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("192.168.0.254")).toBe(true);

      // Current network & CGNAT
      expect(isPrivateOrReservedIpv4("0.0.0.0")).toBe(true);
      expect(isPrivateOrReservedIpv4("100.64.0.1")).toBe(true);

      // Multicast & Reserved
      expect(isPrivateOrReservedIpv4("224.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("240.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv4("255.255.255.255")).toBe(true);
    });

    it("allows public IPv4 addresses", () => {
      expect(isPrivateOrReservedIpv4("8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedIpv4("1.1.1.1")).toBe(false);
      expect(isPrivateOrReservedIpv4("93.184.216.34")).toBe(false);
      expect(isPrivateOrReservedIpv4("142.250.190.46")).toBe(false);
    });

    it("returns false for non-IPv4 inputs", () => {
      expect(isPrivateOrReservedIpv4("not-an-ip")).toBe(false);
      expect(isPrivateOrReservedIpv4("::1")).toBe(false);
    });
  });

  describe("isPrivateOrReservedIpv6", () => {
    it("identifies private, link-local, and loopback IPv6 addresses as restricted", () => {
      expect(isPrivateOrReservedIpv6("::1")).toBe(true);
      expect(isPrivateOrReservedIpv6("::")).toBe(true);
      expect(isPrivateOrReservedIpv6("fe80::1")).toBe(true);
      expect(isPrivateOrReservedIpv6("fc00::1")).toBe(true);
      expect(isPrivateOrReservedIpv6("fd12:3456:789a::1")).toBe(true);
      expect(isPrivateOrReservedIpv6("ff02::1")).toBe(true);
    });

    it("detects IPv4-mapped private IPv6 addresses", () => {
      expect(isPrivateOrReservedIpv6("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv6("::ffff:169.254.169.254")).toBe(true);
      expect(isPrivateOrReservedIpv6("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIpv6("::ffff:8.8.8.8")).toBe(false);
    });

    it("allows public IPv6 addresses", () => {
      expect(isPrivateOrReservedIpv6("2607:f8b0:4005:805::200e")).toBe(false);
      expect(isPrivateOrReservedIpv6("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("isDisallowedHostname", () => {
    it("blocks localhost and local domain suffixes", () => {
      expect(isDisallowedHostname("localhost")).toBe(true);
      expect(isDisallowedHostname("LOCALHOST")).toBe(true);
      expect(isDisallowedHostname("app.localhost")).toBe(true);
      expect(isDisallowedHostname("myserver.local")).toBe(true);
      expect(isDisallowedHostname("api.internal")).toBe(true);
      expect(isDisallowedHostname("router.lan")).toBe(true);
      expect(isDisallowedHostname("workstation.corp")).toBe(true);
    });

    it("blocks cloud metadata hosts", () => {
      expect(isDisallowedHostname("metadata.google.internal")).toBe(true);
      expect(isDisallowedHostname("metadata.internal")).toBe(true);
      expect(isDisallowedHostname("metadata")).toBe(true);
      expect(isDisallowedHostname("instance-data")).toBe(true);
    });

    it("blocks numeric IP representations", () => {
      expect(isDisallowedHostname("2130706433")).toBe(true);
      expect(isDisallowedHostname("0x7f000001")).toBe(true);
    });

    it("blocks IP literals in restricted ranges", () => {
      expect(isDisallowedHostname("127.0.0.1")).toBe(true);
      expect(isDisallowedHostname("169.254.169.254")).toBe(true);
      expect(isDisallowedHostname("10.0.0.5")).toBe(true);
    });

    it("allows valid public hostnames", () => {
      expect(isDisallowedHostname("feeds.buzzsprout.com")).toBe(false);
      expect(isDisallowedHostname("traffic.libsyn.com")).toBe(false);
      expect(isDisallowedHostname("example.com")).toBe(false);
    });
  });

  describe("validateUrlForSsrf", () => {
    it("rejects non-http/https protocols", async () => {
      await expect(validateUrlForSsrf("file:///etc/passwd")).rejects.toThrow("Invalid protocol");
      await expect(validateUrlForSsrf("ftp://example.com/audio.mp3")).rejects.toThrow("Invalid protocol");
      await expect(validateUrlForSsrf("gopher://example.com")).rejects.toThrow("Invalid protocol");
      await expect(validateUrlForSsrf("javascript:alert(1)")).rejects.toThrow("Invalid protocol");
    });

    it("rejects restricted hostnames without DNS lookup", async () => {
      await expect(validateUrlForSsrf("http://localhost/feed.xml")).rejects.toThrow("blocked");
      await expect(validateUrlForSsrf("http://169.254.169.254/latest/meta-data/")).rejects.toThrow("blocked");
      await expect(validateUrlForSsrf("http://127.0.0.1:8080/")).rejects.toThrow("blocked");
      await expect(validateUrlForSsrf("http://metadata.google.internal/computeMetadata/v1/")).rejects.toThrow("blocked");
      await expect(validateUrlForSsrf("http://internal-service.local/api")).rejects.toThrow("blocked");
    });

    it("rejects dangerous or sensitive ports", async () => {
      await expect(validateUrlForSsrf("http://example.com:22/feed.xml", { skipDns: true })).rejects.toThrow("Invalid port");
      await expect(validateUrlForSsrf("http://example.com:2375/v1/containers", { skipDns: true })).rejects.toThrow("Invalid port");
      await expect(validateUrlForSsrf("http://example.com:6379/", { skipDns: true })).rejects.toThrow("Invalid port");
      await expect(validateUrlForSsrf("http://example.com:3306/", { skipDns: true })).rejects.toThrow("Invalid port");
    });

    it("accepts standard web ports", async () => {
      const url80 = await validateUrlForSsrf("http://example.com:80/feed.xml", { skipDns: true });
      expect(url80.hostname).toBe("example.com");

      const url443 = await validateUrlForSsrf("https://example.com:443/feed.xml", { skipDns: true });
      expect(url443.hostname).toBe("example.com");

      const url8080 = await validateUrlForSsrf("http://example.com:8080/feed.xml", { skipDns: true });
      expect(url8080.port).toBe("8080");
    });

    it("rejects excessively long URLs (> 2048 chars)", async () => {
      const longUrl = "https://example.com/" + "a".repeat(2050);
      await expect(validateUrlForSsrf(longUrl)).rejects.toThrow("exceeds maximum limit");
    });

    it("validates and normalizes legitimate public podcast URLs", async () => {
      const parsed = await validateUrlForSsrf("https://example.com/podcast/rss.xml", { skipDns: true });
      expect(parsed.hostname).toBe("example.com");
      expect(parsed.pathname).toBe("/podcast/rss.xml");
    });
  });

  describe("safeFetch", () => {
    it("blocks requests to internal hosts immediately", async () => {
      await expect(safeFetch("http://127.0.0.1:8080/secret")).rejects.toThrow();
      await expect(safeFetch("http://169.254.169.254/meta-data")).rejects.toThrow();
    });

    it("prevents redirects to internal IP addresses", async () => {
      // Mock global fetch to return a 302 redirect to metadata IP
      const mockFetch = vi.fn().mockResolvedValueOnce({
        status: 302,
        headers: new Headers({
          location: "http://169.254.169.254/computeMetadata/v1/"
        })
      });
      vi.stubGlobal("fetch", mockFetch);

      try {
        await expect(
          safeFetch("https://example.com/redirect-to-metadata", { skipDns: true })
        ).rejects.toThrow("blocked (SSRF protection)");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("enforces maximum redirect limit", async () => {
      // Mock global fetch to return infinite redirects
      const mockFetch = vi.fn().mockResolvedValue({
        status: 302,
        headers: new Headers({
          location: "https://example.com/loop"
        })
      });
      vi.stubGlobal("fetch", mockFetch);

      try {
        await expect(
          safeFetch("https://example.com/loop", { maxRedirects: 2, skipDns: true })
        ).rejects.toThrow("Too many redirects");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
