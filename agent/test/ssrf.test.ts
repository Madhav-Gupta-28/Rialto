import { describe, expect, it } from "vitest";
import { isBlockedHost } from "../src/document.js";

/**
 * The prospectus URI is chosen by the counterparty, so every one of these is a
 * host an issuer could name and an agent could be made to reach out to. The
 * hash check means nothing useful comes back — the request itself is the
 * attack, because it turns the agent into a probe of the network it runs in.
 */
describe("isBlockedHost", () => {
  const blocked: [string, string][] = [
    ["127.0.0.1", "loopback, dotted quad"],
    ["127.1", "loopback, short form — the last part absorbs the missing octets"],
    ["2130706433", "loopback as a decimal integer"],
    ["0x7f000001", "loopback as hex"],
    ["0177.0.0.1", "loopback with an octal first octet"],
    ["::ffff:127.0.0.1", "loopback as IPv4-mapped IPv6"],
    ["::ffff:7f00:1", "the same, written in hex pairs"],
    ["169.254.169.254", "cloud instance metadata"],
    ["::ffff:169.254.169.254", "cloud metadata, mapped"],
    ["2852039166", "cloud metadata as an integer"],
    ["10.0.0.5", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private, top of the range"],
    ["192.168.1.1", "private"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "this network"],
    ["255.255.255.255", "broadcast"],
    ["239.1.2.3", "multicast"],
    ["localhost", "by name"],
    ["FOO.LOCALHOST", "by name, shouting"],
    ["printer.local", "mDNS"],
    ["fd00::1", "unique-local IPv6"],
    ["fe80::1", "link-local IPv6"],
    ["::1", "IPv6 loopback"],
  ];
  for (const [host, why] of blocked) {
    it(`blocks ${host} — ${why}`, () => expect(isBlockedHost(host)).toBe(true));
  }

  /// Over-blocking is its own failure: it would refuse real prospectuses.
  const allowed = [
    "gist.githubusercontent.com",
    "ipfs.io",
    "example.com",
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1", // just below the private block
    "172.32.0.1", // just above it
    "192.169.0.1", // adjacent to 192.168/16
    "100.63.255.255", // just below CGNAT
    "100.128.0.1", // just above it
    "223.255.255.255", // last address before multicast
    "2606:4700::1111", // public IPv6
  ];
  for (const host of allowed) {
    it(`allows ${host}`, () => expect(isBlockedHost(host)).toBe(false));
  }
});
