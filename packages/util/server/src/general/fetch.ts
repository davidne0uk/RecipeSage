import fetch, { RequestInit } from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { isPrivateAddress } from "./isPrivateAddress";

const { CLIP_PROXY_URL, CLIP_PROXY_USERNAME, CLIP_PROXY_PASSWORD } =
  process.env;

// All domains must be whitelisted for security reasons
const FETCH_DOMAIN_ALLOWLIST = [
  "chefbook-dev.s3.amazonaws.com", // Dev S3
  "chefbook-dev.s3.us-west-2.amazonaws.com", // Dev S3
  "chefbook-prod.s3.amazonaws.com", // Prod S3
  "chefbook-prod.s3.us-west-2.amazonaws.com", // Prod S3
  "cdn2.pepperplate.com", // Pepperplate import
  "api.scrapfly.io", // A supported scraping proxy option
];
if (process.env.FETCH_DOMAIN_ALLOWLIST) {
  FETCH_DOMAIN_ALLOWLIST.push(...process.env.FETCH_DOMAIN_ALLOWLIST.split(","));
}
// Selfhost object storage is reached by its internal hostname, so it must be
// trusted explicitly rather than blocked as a private address.
if (process.env.AWS_ENDPOINT) {
  try {
    FETCH_DOMAIN_ALLOWLIST.push(new URL(process.env.AWS_ENDPOINT).hostname);
  } catch (_e) {
    console.error("AWS_ENDPOINT is not a valid URL; not allowlisting it");
  }
}

/**
 * Resolves DNS at connect time and refuses private destinations. Because the
 * agent performs the lookup for every connection, this also covers each hop of
 * a redirect chain, and the address that is checked is the address that is
 * dialled -- leaving no window for a DNS rebind between check and connect.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    options,
    (err, address: string | LookupAddress[], family: number) => {
      if (err) {
        callback(err, address as string, family);
        return;
      }

      const resolved: LookupAddress[] = Array.isArray(address)
        ? address
        : [{ address, family }];

      const blocked = resolved.find((entry) => isPrivateAddress(entry.address));
      if (blocked) {
        callback(
          new Error(
            `Refusing to fetch ${hostname}: resolves to private address ${blocked.address}`,
          ),
          "",
          0,
        );
        return;
      }

      // Forward exactly what dnsLookup produced (string or LookupAddress[]).
      (
        callback as (err: NodeJS.ErrnoException | null, ...a: unknown[]) => void
      )(null, address, family);
    },
  );
};

const guardedHttpAgent = new http.Agent({ lookup: guardedLookup });
const guardedHttpsAgent = new https.Agent({ lookup: guardedLookup });
const guardedAgent = (parsedURL: URL) =>
  parsedURL.protocol === "http:" ? guardedHttpAgent : guardedHttpsAgent;

/**
 * Node skips DNS resolution when the host is already an IP literal, so
 * guardedLookup never runs for those. They must be checked separately.
 */
const assertPublicUrl = (url: string) => {
  const parsed = new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Refusing to fetch unsupported protocol ${parsed.protocol}`,
    );
  }

  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(host) && isPrivateAddress(host)) {
    throw new Error(`Refusing to fetch ${url}: private address ${host}`);
  }
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 10;

/**
 * Follows redirects by hand so that every hop is re-checked. Letting node-fetch
 * follow them would skip the literal-IP check on each subsequent location.
 */
const fetchGuarded = async (destURL: string, fetchOpts: RequestInit) => {
  let currentURL = destURL;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    assertPublicUrl(currentURL);

    const response = await fetch(currentURL, {
      ...fetchOpts,
      agent: guardedAgent,
      redirect: "manual",
    });

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;

    currentURL = new URL(location, currentURL).toString();
  }

  throw new Error(`Refusing to fetch ${destURL}: too many redirects`);
};

export const fetchURL = async (
  destURL: string,
  options?: {
    requestConfig?: Partial<RequestInit>;
    timeout?: number;
  },
) => {
  const fetchOpts: RequestInit = {
    method: "GET",
    signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    ...options?.requestConfig,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      ...options?.requestConfig?.headers,
    },
  };

  const isAllowlisted = FETCH_DOMAIN_ALLOWLIST.includes(
    new URL(destURL).hostname,
  );

  if (isAllowlisted) {
    return fetch(destURL, fetchOpts);
  }

  // Selfhost users import from arbitrary public recipe sites, which cannot be
  // allowlisted ahead of time. Permit any public destination, but refuse to
  // reach private ranges -- otherwise a user-supplied import URL becomes an
  // SSRF into the container network and LAN.
  if (process.env.NODE_ENV === "selfhost") {
    return fetchGuarded(destURL, fetchOpts);
  }

  const isProxyEnabled = !!CLIP_PROXY_URL;
  if (!isProxyEnabled) {
    throw new Error("Domain not allowlisted and proxy not enabled");
  }

  const proxyUrl = new URL(CLIP_PROXY_URL);
  if (CLIP_PROXY_USERNAME && CLIP_PROXY_PASSWORD) {
    proxyUrl.username = CLIP_PROXY_USERNAME;
    proxyUrl.password = CLIP_PROXY_PASSWORD;
  }

  fetchOpts.agent = new HttpsProxyAgent(proxyUrl);

  return fetch(destURL, fetchOpts);
};
