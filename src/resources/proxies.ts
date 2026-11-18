import type { HttpClient, RequestOptions } from '../core/http';
import { parseProxyString, toProxyUrl, type ParsedProxy } from '../proxy-string';
import type {
  CreateRotationLinksParams,
  GeneratedProxies,
  GenerateProxiesParams,
  GeoAsn,
  GeoCity,
  GeoCountry,
  GeoState,
  IpEcho,
  IpInfo,
  PlanType,
  ProxyList,
  ProxyListQuery,
  ProxyPlan,
  RotateParams,
  RotationLink,
  RotationResult,
  WhitelistAddParams,
  WhitelistRemoveParams,
} from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export class Whitelist {
  constructor(private readonly http: HttpClient) {}

  /** IPs whitelisted on an order (`GET /public/proxies/whitelist-ip`). */
  async list(orderId: string, options?: CallOptions): Promise<string[]> {
    const payload = await this.http.request<{ whitelist_ip?: string[] }>('GET', '/public/proxies/whitelist-ip', { query: { orderId }, ...options });
    return payload.whitelist_ip ?? [];
  }

  /** Whitelists an IP on an order (`POST /public/proxies/whitelist-ip`). */
  add(params: WhitelistAddParams, options?: CallOptions): Promise<unknown> {
    return this.http.request('POST', '/public/proxies/whitelist-ip', { body: params, ...options });
  }

  /** Removes a whitelisted IP (`DELETE /public/proxies/whitelist-ip`). */
  remove(params: WhitelistRemoveParams, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', '/public/proxies/whitelist-ip', { body: params, ...options });
  }
}

export class RotationLinks {
  constructor(private readonly http: HttpClient) {}

  /** `GET /public/proxies/{orderId}/rotation-links` */
  async list(orderId: string, query: { includeRevoked?: boolean } = {}, options?: CallOptions): Promise<RotationLink[]> {
    const payload = await this.http.request<{ links?: RotationLink[] }>('GET', `/public/proxies/${encodeURIComponent(orderId)}/rotation-links`, {
      query,
      ...options,
    });
    return payload.links ?? [];
  }

  /** `POST /public/proxies/{orderId}/rotation-links` */
  create(orderId: string, params: CreateRotationLinksParams, options?: CallOptions): Promise<unknown> {
    return this.http.request('POST', `/public/proxies/${encodeURIComponent(orderId)}/rotation-links`, { body: params, ...options });
  }

  /** `DELETE /public/proxies/{orderId}/rotation-links/{linkId}` */
  revoke(orderId: string, linkId: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/public/proxies/${encodeURIComponent(orderId)}/rotation-links/${encodeURIComponent(linkId)}`, options);
  }
}

export class Proxies {
  readonly whitelist: Whitelist;
  readonly rotationLinks: RotationLinks;

  constructor(private readonly http: HttpClient) {
    this.whitelist = new Whitelist(http);
    this.rotationLinks = new RotationLinks(http);
  }

  /** One page of your proxy plans (`GET /public/proxies`). */
  list(query: ProxyListQuery = {}, options?: CallOptions): Promise<ProxyList> {
    return this.http.request('GET', '/public/proxies', { query: query as Record<string, string | number | undefined>, ...options });
  }

  /** Iterates over every proxy plan, following `pagination.hasMore`. */
  async *iterate(query: Omit<ProxyListQuery, 'offset'> = {}, options?: CallOptions): AsyncGenerator<ProxyPlan, void, undefined> {
    let offset = 0;
    const limit = query.limit ?? 50;
    for (;;) {
      const page = await this.list({ ...query, limit, offset }, options);
      const plans = page.proxies ?? [];
      for (const plan of plans) yield plan;
      if (!page.pagination?.hasMore || plans.length === 0) return;
      offset += plans.length;
    }
  }

  /** Generates proxy strings for a plan (`POST /public/proxies/generate`). */
  generate(params: GenerateProxiesParams, options?: CallOptions): Promise<GeneratedProxies> {
    return this.http.request('POST', '/public/proxies/generate', { body: params, ...options });
  }

  /**
   * Generates proxy strings and returns them parsed, each with a ready `url`
   * (`http://user:pass@host:port` or `socks5://...`) for HTTP clients.
   */
  async generateUrls(params: GenerateProxiesParams, options?: CallOptions): Promise<Array<ParsedProxy & { url: string }>> {
    const res = await this.generate(params, options);
    const protocol = params.protocol === 'socks5' ? 'socks5' : 'http';
    return (res.proxies ?? []).map((line) => {
      const parsed = parseProxyString(line, protocol);
      return { ...parsed, url: toProxyUrl(parsed) };
    });
  }

  /** Geolocates an IP (`GET /public/proxies/ip-info`). */
  ipInfo(ip: string, options?: CallOptions): Promise<IpInfo> {
    return this.http.request('GET', '/public/proxies/ip-info', { query: { ip }, ...options });
  }

  /**
   * The caller's IP and its location as Cloudflare sees it (`GET /public/ip-echo`).
   * Send it through a proxy to see the exit IP; called directly it shows your own IP.
   */
  ipEcho(options?: CallOptions): Promise<IpEcho> {
    return this.http.request('GET', '/public/ip-echo', options);
  }

  /** Restarts a sticky session: same string, new IP (`POST /public/proxies/{orderId}/rotate`). */
  rotate(orderId: string, params: RotateParams, options?: CallOptions): Promise<RotationResult> {
    return this.http.request('POST', `/public/proxies/${encodeURIComponent(orderId)}/rotate`, { body: params, ...options });
  }
}

export class ProxyLocations {
  constructor(private readonly http: HttpClient) {}

  /** `GET /public/geo/countries` */
  async countries(planType: PlanType, options?: CallOptions): Promise<GeoCountry[]> {
    const p = await this.http.request<{ countries?: GeoCountry[] }>('GET', '/public/geo/countries', { query: { planType }, ...options });
    return p.countries ?? [];
  }

  /** `GET /public/geo/states` */
  async states(planType: PlanType, country: string, options?: CallOptions): Promise<GeoState[]> {
    const p = await this.http.request<{ states?: GeoState[] }>('GET', '/public/geo/states', { query: { planType, country }, ...options });
    return p.states ?? [];
  }

  /** `GET /public/geo/cities` */
  async cities(planType: PlanType, country: string, state?: string, options?: CallOptions): Promise<GeoCity[]> {
    const p = await this.http.request<{ cities?: GeoCity[] }>('GET', '/public/geo/cities', { query: { planType, country, state }, ...options });
    return p.cities ?? [];
  }

  /** `GET /public/geo/asns` (Residential Basic and Datacenter). */
  async asns(planType: PlanType, country?: string, options?: CallOptions): Promise<GeoAsn[]> {
    const p = await this.http.request<{ asns?: GeoAsn[] }>('GET', '/public/geo/asns', { query: { planType, country }, ...options });
    return p.asns ?? [];
  }
}
