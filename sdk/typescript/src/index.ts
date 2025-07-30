/**
 * PUO Memo TypeScript SDK
 * Official TypeScript/JavaScript client for PUO Memo API
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';

export const VERSION = '1.0.0';

// Error types
export class PuoMemoError extends Error {
  constructor(message: string, public code?: string, public statusCode?: number) {
    super(message);
    this.name = 'PuoMemoError';
  }
}

export class AuthenticationError extends PuoMemoError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends PuoMemoError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends PuoMemoError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

// Types
export interface Memory {
  id?: string;
  content: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  visibility?: 'private' | 'team' | 'public';
  has_embedding?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  tenant_id?: string;
}

export interface SearchResult {
  results: Memory[];
  total: number;
  search_type: string;
  query: string;
  limit: number;
  offset: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  tenant_id: string;
  role: string;
  permissions: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  expires_at?: string;
  last_used_at?: string;
  permissions?: string[];
}

export interface PuoMemoConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  onTokenRefresh?: (tokens: TokenResponse) => void;
}

export interface CreateMemoryParams {
  content: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  visibility?: 'private' | 'team' | 'public';
  generateEmbedding?: boolean;
}

export interface UpdateMemoryParams {
  content?: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  visibility?: 'private' | 'team' | 'public';
  regenerateEmbedding?: boolean;
}

export interface ListMemoriesParams {
  limit?: number;
  offset?: number;
  tags?: string[];
  visibility?: ('private' | 'team' | 'public')[];
}

export interface SearchParams {
  query: string;
  searchType?: 'keyword' | 'semantic' | 'hybrid';
  limit?: number;
  offset?: number;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  visibility?: ('private' | 'team' | 'public')[];
  similarityThreshold?: number;
  keywordWeight?: number;
  semanticWeight?: number;
}

export interface CreateApiKeyParams {
  name: string;
  permissions?: string[];
  expiresAt?: Date;
}

/**
 * PUO Memo API Client
 * 
 * @example
 * ```typescript
 * import { PuoMemo } from '@puomemo/sdk';
 * 
 * // Using API key
 * const client = new PuoMemo({ apiKey: 'puo_sk_...' });
 * 
 * // Using email/password
 * const client = new PuoMemo();
 * await client.login('user@example.com', 'password');
 * 
 * // Create memory
 * const memory = await client.createMemory({
 *   content: 'Important information',
 *   tags: ['work', 'project']
 * });
 * 
 * // Search memories
 * const results = await client.search({
 *   query: 'project updates'
 * });
 * ```
 */
export class PuoMemo {
  private client: AxiosInstance;
  private config: Required<PuoMemoConfig>;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiresAt?: number;

  constructor(config: PuoMemoConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.PUO_MEMO_API_KEY,
      baseUrl: config.baseUrl || process.env.PUO_MEMO_API_URL || 'https://api.puomemo.com',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
      onTokenRefresh: config.onTokenRefresh || (() => {}),
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'User-Agent': `puomemo-typescript/${VERSION}`,
        'Content-Type': 'application/json',
      },
    });

    // Setup retry logic
    axiosRetry(this.client, {
      retries: this.config.maxRetries,
      retryDelay: (retryCount) => {
        return retryCount * this.config.retryDelay;
      },
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429
        );
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      async (config) => {
        const token = await this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response) {
          const { status, data } = error.response;
          const message = (data as any)?.detail || error.message;

          switch (status) {
            case 401:
              // Try to refresh token if we have a refresh token
              if (this.refreshToken && !error.config?.headers['X-No-Retry']) {
                try {
                  await this.refreshAccessToken();
                  // Retry original request
                  error.config!.headers['X-No-Retry'] = 'true';
                  return this.client.request(error.config!);
                } catch (refreshError) {
                  throw new AuthenticationError(message);
                }
              }
              throw new AuthenticationError(message);
            case 429:
              const retryAfter = parseInt(
                error.response.headers['retry-after'] || '60'
              );
              throw new RateLimitError(message, retryAfter);
            case 400:
              throw new ValidationError(message);
            default:
              throw new PuoMemoError(message, 'API_ERROR', status);
          }
        }
        throw new PuoMemoError(error.message);
      }
    );
  }

  private async getAuthToken(): Promise<string | undefined> {
    if (this.accessToken && this.tokenExpiresAt) {
      // Check if token is expired (with 1 minute buffer)
      if (Date.now() >= this.tokenExpiresAt - 60000) {
        if (this.refreshToken) {
          await this.refreshAccessToken();
        } else {
          throw new AuthenticationError('Access token expired');
        }
      }
      return this.accessToken;
    }
    return this.config.apiKey;
  }

  // Authentication methods
  async login(email: string, password: string): Promise<User> {
    const response = await this.client.post<TokenResponse>('/api/auth/login', {
      email,
      password,
    });

    const tokens = response.data;
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;

    this.config.onTokenRefresh(tokens);

    return this.getCurrentUser();
  }

  async register(
    email: string,
    password: string,
    fullName: string,
    organizationName?: string
  ): Promise<User> {
    const response = await this.client.post<User>('/api/auth/register', {
      email,
      password,
      full_name: fullName,
      organization_name: organizationName,
    });

    return response.data;
  }

  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }

    const response = await this.client.post<TokenResponse>('/api/auth/refresh', {
      refresh_token: this.refreshToken,
    });

    const tokens = response.data;
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;

    this.config.onTokenRefresh(tokens);

    return tokens;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/api/auth/logout');
    } catch (error) {
      // Ignore logout errors
    } finally {
      this.accessToken = undefined;
      this.refreshToken = undefined;
      this.tokenExpiresAt = undefined;
    }
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/api/auth/me');
    return response.data;
  }

  // Memory operations
  async createMemory(params: CreateMemoryParams): Promise<Memory> {
    const response = await this.client.post<Memory>('/api/memories', {
      content: params.content,
      title: params.title,
      tags: params.tags,
      metadata: params.metadata,
      visibility: params.visibility || 'private',
      generate_embedding: params.generateEmbedding ?? true,
    });
    return response.data;
  }

  async getMemory(memoryId: string): Promise<Memory> {
    const response = await this.client.get<Memory>(`/api/memories/${memoryId}`);
    return response.data;
  }

  async updateMemory(
    memoryId: string,
    params: UpdateMemoryParams
  ): Promise<Memory> {
    const response = await this.client.put<Memory>(`/api/memories/${memoryId}`, {
      content: params.content,
      title: params.title,
      tags: params.tags,
      metadata: params.metadata,
      visibility: params.visibility,
      regenerate_embedding: params.regenerateEmbedding || false,
    });
    return response.data;
  }

  async deleteMemory(memoryId: string): Promise<void> {
    await this.client.delete(`/api/memories/${memoryId}`);
  }

  async listMemories(
    params: ListMemoriesParams = {}
  ): Promise<{ memories: Memory[]; total: number }> {
    const response = await this.client.get<{ memories: Memory[]; total: number }>(
      '/api/memories',
      { params }
    );
    return response.data;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const searchParams: any = {
      query: params.query,
      search_type: params.searchType || 'hybrid',
      limit: params.limit || 10,
      offset: params.offset || 0,
      tags: params.tags,
      visibility: params.visibility,
      similarity_threshold: params.similarityThreshold || 0.7,
      keyword_weight: params.keywordWeight || 0.5,
      semantic_weight: params.semanticWeight || 0.5,
    };

    if (params.dateFrom) {
      searchParams.date_from = params.dateFrom.toISOString();
    }
    if (params.dateTo) {
      searchParams.date_to = params.dateTo.toISOString();
    }

    const response = await this.client.get<SearchResult>('/api/memories/search', {
      params: searchParams,
    });
    return response.data;
  }

  // API Key management
  async createApiKey(params: CreateApiKeyParams): Promise<string> {
    const data: any = {
      name: params.name,
      permissions: params.permissions,
    };

    if (params.expiresAt) {
      data.expires_at = params.expiresAt.toISOString();
    }

    const response = await this.client.post<{ api_key: string }>(
      '/api/auth/api-keys',
      data
    );
    return response.data.api_key;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const response = await this.client.get<ApiKey[]>('/api/auth/api-keys');
    return response.data;
  }

  async revokeApiKey(keyId: string): Promise<void> {
    await this.client.delete(`/api/auth/api-keys/${keyId}`);
  }

  // Statistics
  async getStats(): Promise<Record<string, any>> {
    const response = await this.client.get<Record<string, any>>('/api/stats');
    return response.data;
  }
}

// Default export
export default PuoMemo;