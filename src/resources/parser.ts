import type { HttpClient, RequestOptions } from '../core/http';
import type {
  CreateParserPresetParams,
  GenerateParserParams,
  GenerateParserResult,
  HealResult,
  ParserPreset,
  PresetStatsView,
  UpdateParserPresetParams,
} from '../types';

type CallOptions = Pick<RequestOptions, 'signal' | 'timeoutMs'>;

export class ParserPresets {
  constructor(private readonly http: HttpClient) {}

  /** `GET /scraper/parser/presets` */
  async list(options?: CallOptions): Promise<ParserPreset[]> {
    const payload = await this.http.request<{ presets?: ParserPreset[] }>('GET', '/scraper/parser/presets', options);
    return payload.presets ?? [];
  }

  /** `POST /scraper/parser/presets` */
  create(params: CreateParserPresetParams, options?: CallOptions): Promise<ParserPreset> {
    return this.http.request('POST', '/scraper/parser/presets', { body: params, ...options });
  }

  /** `GET /scraper/parser/presets/{id}` */
  get(id: string, options?: CallOptions): Promise<ParserPreset> {
    return this.http.request('GET', `/scraper/parser/presets/${encodeURIComponent(id)}`, options);
  }

  /** `PUT /scraper/parser/presets/{id}` */
  update(id: string, params: UpdateParserPresetParams, options?: CallOptions): Promise<ParserPreset> {
    return this.http.request('PUT', `/scraper/parser/presets/${encodeURIComponent(id)}`, { body: params, ...options });
  }

  /** `DELETE /scraper/parser/presets/{id}` */
  delete(id: string, options?: CallOptions): Promise<unknown> {
    return this.http.request('DELETE', `/scraper/parser/presets/${encodeURIComponent(id)}`, options);
  }

  /** Regenerates a preset's selectors now (`POST /scraper/parser/presets/{id}/heal`). */
  heal(id: string, params: { force?: boolean } = {}, options?: CallOptions): Promise<HealResult> {
    return this.http.request('POST', `/scraper/parser/presets/${encodeURIComponent(id)}/heal`, { body: params, ...options });
  }

  /** How well a preset still works (`GET /scraper/parser/presets/{id}/stats`). */
  stats(id: string, options?: CallOptions): Promise<PresetStatsView> {
    return this.http.request('GET', `/scraper/parser/presets/${encodeURIComponent(id)}/stats`, options);
  }
}

export class Parser {
  readonly presets: ParserPresets;
  constructor(private readonly http: HttpClient) {
    this.presets = new ParserPresets(http);
  }

  /** Generates CSS selectors for a page once, with an LLM (`POST /scraper/parser/generate`). */
  generate(params: GenerateParserParams, options?: CallOptions): Promise<GenerateParserResult> {
    return this.http.request('POST', '/scraper/parser/generate', { body: params, ...options });
  }
}
