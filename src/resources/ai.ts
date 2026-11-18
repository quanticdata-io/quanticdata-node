import type { HttpClient, RequestOptions } from '../core/http';
import type { AiAgentParams, AiAgentResult, AiFinderResult, AiPlacesParams, AiShoppingParams } from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export class AI {
  constructor(private readonly http: HttpClient) {}

  /** Natural-language scraping agent (`POST /scraper/ai`). */
  agent(params: AiAgentParams, options?: CallOptions): Promise<AiAgentResult> {
    return this.http.request('POST', '/scraper/ai', { body: params, ...options });
  }

  /** AI Places Finder (`POST /scraper/places-ai`). */
  places(params: AiPlacesParams, options?: CallOptions): Promise<AiFinderResult> {
    return this.http.request('POST', '/scraper/places-ai', { body: params, ...options });
  }

  /** AI Shopping Finder (`POST /scraper/shopping-ai`). */
  shopping(params: AiShoppingParams, options?: CallOptions): Promise<AiFinderResult> {
    return this.http.request('POST', '/scraper/shopping-ai', { body: params, ...options });
  }
}
