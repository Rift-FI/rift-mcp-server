// HTTP client for calling the Rift API Wrapper

// Slightly above the wrapper's 130s server timeout so we get the wrapper's
// own timeout response instead of aborting first. Long-running ramp ops
// (mobile-money STK push) drive this — quick reads finish well under it.
const DEFAULT_TIMEOUT_MS = 135_000;

export class RiftApiClient {
  private baseUrl: string;
  private apiKey: string;
  private bearerToken?: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBearerToken(token: string) {
    this.bearerToken = token;
  }

  clearBearerToken() {
    this.bearerToken = undefined;
  }

  isAuthenticated(): boolean {
    return !!this.bearerToken;
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  async request<T = any>(
    method: string,
    path: string,
    options?: { body?: any; params?: Record<string, string> }
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error("No API key set. Use rift_set_api_key first.");
    }

    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.params) {
      Object.entries(options.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          url.searchParams.set(k, v);
        }
      });
    }

    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };

    if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const fetchOpts: RequestInit = { method, headers, signal: controller.signal };
    if (options?.body && (method === "POST" || method === "PUT" || method === "DELETE")) {
      fetchOpts.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), fetchOpts);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        throw new Error(
          `Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. ` +
            `The wrapper or upstream API may be hung. For ramp operations ` +
            `that may have already submitted, check status before retrying.`
        );
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      if (!response.ok) {
        throw new Error(`Server error (HTTP ${response.status}). The API may be temporarily unavailable.`);
      }
      const text = await response.text();
      throw new Error(`Unexpected non-JSON response from API: ${text.slice(0, 200)}`);
    }

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data as T;
  }
}
