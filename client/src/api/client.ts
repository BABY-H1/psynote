const API_BASE = '/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

class ApiClient {
  private accessToken: string | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, headers: customHeaders, ...rest } = options;

    const headers: Record<string, string> = {
      ...customHeaders as Record<string, string>,
    };

    // Only set Content-Type for requests that have a body
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // In dev mode, add user info headers for the dev auth bypass
    if (import.meta.env.DEV && this.accessToken === 'demo-token-not-real') {
      // Read from zustand persisted state
      try {
        const stored = JSON.parse(localStorage.getItem('psynote-auth') || '{}');
        const state = stored.state || {};
        if (state.user?.id) headers['X-Dev-User-Id'] = state.user.id;
        if (state.user?.email) headers['X-Dev-User-Email'] = state.user.email;
        if (state.currentRole) headers['X-Dev-Role'] = state.currentRole;
      } catch { /* ignore */ }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, error.message || 'Request failed', error.error);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = new ApiClient();
