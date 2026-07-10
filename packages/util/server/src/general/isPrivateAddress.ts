import { isIP } from "node:net";

const isPrivateIPv4 = (address: string): boolean => {
  const octets = address.split(".").map((octet) => parseInt(octet, 10));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet)))
    return true;

  const [a, b] = octets;

  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918 private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918 private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // RFC1918 private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
};

const isPrivateIPv6 = (address: string): boolean => {
  const normalized = address.toLowerCase().split("%")[0];

  if (normalized === "::" || normalized === "::1") return true;

  // IPv4-mapped (::ffff:127.0.0.1) reaches the embedded IPv4 address
  const mapped = /^::ffff:(.+)$/.exec(normalized);
  if (mapped) {
    return isIP(mapped[1]) === 4 ? isPrivateIPv4(mapped[1]) : true;
  }

  if (/^f[cd]/.test(normalized)) return true; // unique local, fc00::/7
  if (/^fe[89ab]/.test(normalized)) return true; // link-local, fe80::/10
  if (normalized.startsWith("ff")) return true; // multicast

  return false;
};

/**
 * Whether an IP address belongs to a range that must not be reachable via
 * user-supplied URLs. Anything that is not a literal IP address is treated as
 * private, so callers cannot pass an unresolved hostname and skip the check.
 */
export const isPrivateAddress = (address: string): boolean => {
  const version = isIP(address);

  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) return isPrivateIPv6(address);

  return true;
};
