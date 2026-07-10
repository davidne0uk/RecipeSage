import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./isPrivateAddress";

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "RFC1918 10/8"],
    ["172.16.0.1", "RFC1918 172.16/12"],
    ["172.31.255.255", "RFC1918 172.16/12 upper bound"],
    ["192.168.1.1", "RFC1918 192.168/16"],
    ["169.254.169.254", "cloud metadata"],
    ["0.0.0.0", "this network"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["fd00::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link-local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata"],
  ])("blocks %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    ["1.1.1.1"],
    ["8.8.8.8"],
    ["93.184.216.34"],
    ["172.32.0.1"], // just outside RFC1918
    ["172.15.255.255"], // just outside RFC1918
    ["2606:4700:4700::1111"],
  ])("allows public address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("treats a non-IP value as private so hostnames cannot skip the check", () => {
    expect(isPrivateAddress("example.com")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});
