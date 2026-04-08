// HTTP client for calling the Rift API Wrapper

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

    const fetchOpts: RequestInit = { method, headers };
    if (options?.body && (method === "POST" || method === "PUT" || method === "DELETE")) {
      fetchOpts.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), fetchOpts);
    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data as T;
  }
}
