import type { HttpClient, RequestOptions } from '../core/http';
import type { Balance, BillingStatus, Order, Plan, PlanType, UsageReport } from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export class Account {
  constructor(private readonly http: HttpClient) {}

  /** Per-day usage and cost (`GET /scraper/usage`), 1 to 90 days, default 30. */
  usage(query: { days?: number } = {}, options?: CallOptions): Promise<UsageReport> {
    return this.http.request('GET', '/scraper/usage', { query, ...options });
  }

  /** Billing status and the price list of your account (`GET /scraper/billing`). */
  billing(options?: CallOptions): Promise<BillingStatus> {
    return this.http.request('GET', '/scraper/billing', options);
  }

  /** Wallet balance (`GET /public/balance`). */
  balance(options?: CallOptions): Promise<Balance> {
    return this.http.request('GET', '/public/balance', options);
  }

  /** Plans you can buy (`GET /public/plans`). Read-only: purchases are not wrapped by this SDK version. */
  async plans(query: { planType?: PlanType } = {}, options?: CallOptions): Promise<Plan[]> {
    const p = await this.http.request<{ plans?: Plan[] }>('GET', '/public/plans', { query, ...options });
    return p.plans ?? [];
  }

  /** Your orders (`GET /public/orders`). */
  async orders(query: { limit?: number; offset?: number; type?: 'PROXY' | 'TOPUP' } = {}, options?: CallOptions): Promise<Order[]> {
    const p = await this.http.request<{ orders?: Order[] }>('GET', '/public/orders', { query, ...options });
    return p.orders ?? [];
  }
}
