const API_BASE = '/api';

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  async request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
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

    const response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401: attempt token refresh once, then retry
    if (response.status === 401 && !isRetry) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        return this.request<T>(path, options, true);
      }
      // Refresh failed — force logout
      this.forceLogout();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, error.message || 'Request failed', error.error);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  private async tryRefreshToken(): Promise<boolean> {
    // Deduplicate concurrent refresh attempts
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<boolean> {
    try {
      const stored = JSON.parse(localStorage.getItem('psynote-auth') || '{}');
      const refreshToken = stored.state?.refreshToken;
      if (!refreshToken) return false;

      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (data.accessToken) {
        this.accessToken = data.accessToken;
        // Update the store — import dynamically to avoid circular deps
        const { useAuthStore } = await import('../stores/authStore');
        useAuthStore.getState().updateTokens(data.accessToken, data.refreshToken || refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private forceLogout() {
    this.accessToken = null;
    // Clear persisted auth state
    try {
      const stored = JSON.parse(localStorage.getItem('psynote-auth') || '{}');
      if (stored.state) {
        stored.state.accessToken = null;
        stored.state.refreshToken = null;
        stored.state.user = null;
        localStorage.setItem('psynote-auth', JSON.stringify(stored));
      }
    } catch { /* ignore */ }
    // Redirect to login
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
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

  async uploadFile<T>(path: string, formData: FormData): Promise<T> {
    const headers: Record<string, string> = {};
    // Don't set Content-Type — browser sets it with boundary for FormData
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(response.status, error.message || 'Upload failed', error.error);
    }

    return response.json();
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
