// Package puomemo provides a Go client for the PUO Memo API
package puomemo

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
)

const (
	// Version is the SDK version
	Version = "1.0.0"

	// DefaultBaseURL is the default API base URL
	DefaultBaseURL = "https://api.puomemo.com"

	// DefaultTimeout is the default request timeout
	DefaultTimeout = 30 * time.Second
)

// Error types
type ErrorCode string

const (
	ErrorCodeAuthentication ErrorCode = "AUTHENTICATION_ERROR"
	ErrorCodeRateLimit      ErrorCode = "RATE_LIMIT_ERROR"
	ErrorCodeValidation     ErrorCode = "VALIDATION_ERROR"
	ErrorCodeAPI            ErrorCode = "API_ERROR"
)

// Error represents an API error
type Error struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	RetryAfter int // For rate limit errors
}

func (e *Error) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Memory represents a memory object
type Memory struct {
	ID           string                 `json:"id,omitempty"`
	Content      string                 `json:"content"`
	Title        string                 `json:"title,omitempty"`
	Tags         []string               `json:"tags,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	Visibility   string                 `json:"visibility,omitempty"`
	HasEmbedding bool                   `json:"has_embedding,omitempty"`
	CreatedAt    *time.Time             `json:"created_at,omitempty"`
	UpdatedAt    *time.Time             `json:"updated_at,omitempty"`
	CreatedBy    string                 `json:"created_by,omitempty"`
	TenantID     string                 `json:"tenant_id,omitempty"`
}

// SearchResult represents search results
type SearchResult struct {
	Results    []Memory `json:"results"`
	Total      int      `json:"total"`
	SearchType string   `json:"search_type"`
	Query      string   `json:"query"`
	Limit      int      `json:"limit"`
	Offset     int      `json:"offset"`
}

// User represents a user
type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	FullName    string    `json:"full_name"`
	IsActive    bool      `json:"is_active"`
	IsVerified  bool      `json:"is_verified"`
	CreatedAt   time.Time `json:"created_at"`
	TenantID    string    `json:"tenant_id"`
	Role        string    `json:"role"`
	Permissions []string  `json:"permissions"`
}

// TokenResponse represents authentication tokens
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// APIKey represents an API key
type APIKey struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Prefix      string     `json:"prefix"`
	CreatedAt   time.Time  `json:"created_at"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	LastUsedAt  *time.Time `json:"last_used_at,omitempty"`
	Permissions []string   `json:"permissions,omitempty"`
}

// Client configuration options
type ClientOption func(*Client)

// WithAPIKey sets the API key
func WithAPIKey(apiKey string) ClientOption {
	return func(c *Client) {
		c.apiKey = apiKey
	}
}

// WithBaseURL sets the base URL
func WithBaseURL(baseURL string) ClientOption {
	return func(c *Client) {
		c.baseURL = baseURL
	}
}

// WithTimeout sets the request timeout
func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		c.httpClient.SetTimeout(timeout)
	}
}

// WithHTTPClient sets a custom HTTP client
func WithHTTPClient(httpClient *http.Client) ClientOption {
	return func(c *Client) {
		c.httpClient = resty.NewWithClient(httpClient)
		c.setupClient()
	}
}

// WithRetry configures retry behavior
func WithRetry(maxRetries int, retryWaitTime time.Duration) ClientOption {
	return func(c *Client) {
		c.httpClient.SetRetryCount(maxRetries).
			SetRetryWaitTime(retryWaitTime)
	}
}

// Client is the PUO Memo API client
type Client struct {
	apiKey       string
	baseURL      string
	httpClient   *resty.Client
	accessToken  string
	refreshToken string
	tokenExpiry  time.Time
	mu           sync.RWMutex
}

// NewClient creates a new PUO Memo client
func NewClient(opts ...ClientOption) *Client {
	c := &Client{
		apiKey:     os.Getenv("PUO_MEMO_API_KEY"),
		baseURL:    os.Getenv("PUO_MEMO_API_URL"),
		httpClient: resty.New(),
	}

	if c.baseURL == "" {
		c.baseURL = DefaultBaseURL
	}

	// Apply options
	for _, opt := range opts {
		opt(c)
	}

	c.setupClient()
	return c
}

func (c *Client) setupClient() {
	c.httpClient.
		SetBaseURL(c.baseURL).
		SetTimeout(DefaultTimeout).
		SetHeader("User-Agent", fmt.Sprintf("puomemo-go/%s", Version)).
		SetHeader("Content-Type", "application/json").
		SetRetryCount(3).
		SetRetryWaitTime(1 * time.Second).
		SetRetryMaxWaitTime(10 * time.Second).
		AddRetryCondition(func(r *resty.Response, err error) bool {
			return r.StatusCode() == 429 || r.StatusCode() >= 500
		}).
		OnBeforeRequest(func(c *resty.Client, r *resty.Request) error {
			// Add authentication
			if token := c.Token; token != "" {
				r.SetHeader("Authorization", "Bearer "+token)
			}
			return nil
		}).
		OnAfterResponse(func(c *resty.Client, r *resty.Response) error {
			// Handle errors
			if r.IsError() {
				return handleError(r)
			}
			return nil
		})
}

func (c *Client) getAuthToken() string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// Check if we have an access token that's still valid
	if c.accessToken != "" && time.Now().Before(c.tokenExpiry.Add(-1*time.Minute)) {
		return c.accessToken
	}

	// Otherwise use API key
	return c.apiKey
}

func (c *Client) setTokens(tokens *TokenResponse) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.accessToken = tokens.AccessToken
	c.refreshToken = tokens.RefreshToken
	c.tokenExpiry = time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)
}

func handleError(r *resty.Response) error {
	var apiError struct {
		Detail string `json:"detail"`
	}

	if err := json.Unmarshal(r.Body(), &apiError); err != nil {
		apiError.Detail = string(r.Body())
	}

	e := &Error{
		Message:    apiError.Detail,
		StatusCode: r.StatusCode(),
	}

	switch r.StatusCode() {
	case 401:
		e.Code = ErrorCodeAuthentication
	case 429:
		e.Code = ErrorCodeRateLimit
		if retryAfter := r.Header().Get("Retry-After"); retryAfter != "" {
			// Parse retry-after header
			fmt.Sscanf(retryAfter, "%d", &e.RetryAfter)
		}
	case 400:
		e.Code = ErrorCodeValidation
	default:
		e.Code = ErrorCodeAPI
	}

	return e
}

// Authentication methods

// Login authenticates with email and password
func (c *Client) Login(ctx context.Context, email, password string) (*User, error) {
	var tokens TokenResponse
	
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetBody(map[string]string{
			"email":    email,
			"password": password,
		}).
		SetResult(&tokens).
		Post("/api/auth/login")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	c.setTokens(&tokens)
	c.httpClient.SetAuthToken(c.accessToken)

	return c.GetCurrentUser(ctx)
}

// Register creates a new user account
func (c *Client) Register(ctx context.Context, email, password, fullName string, organizationName *string) (*User, error) {
	body := map[string]interface{}{
		"email":     email,
		"password":  password,
		"full_name": fullName,
	}
	
	if organizationName != nil {
		body["organization_name"] = *organizationName
	}

	var user User
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetBody(body).
		SetResult(&user).
		Post("/api/auth/register")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &user, nil
}

// RefreshAccessToken refreshes the access token
func (c *Client) RefreshAccessToken(ctx context.Context) (*TokenResponse, error) {
	c.mu.RLock()
	refreshToken := c.refreshToken
	c.mu.RUnlock()

	if refreshToken == "" {
		return nil, &Error{
			Code:    ErrorCodeAuthentication,
			Message: "No refresh token available",
		}
	}

	var tokens TokenResponse
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetBody(map[string]string{
			"refresh_token": refreshToken,
		}).
		SetResult(&tokens).
		Post("/api/auth/refresh")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	c.setTokens(&tokens)
	c.httpClient.SetAuthToken(c.accessToken)

	return &tokens, nil
}

// Logout logs out the current user
func (c *Client) Logout(ctx context.Context) error {
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		Post("/api/auth/logout")

	// Clear tokens regardless of response
	c.mu.Lock()
	c.accessToken = ""
	c.refreshToken = ""
	c.tokenExpiry = time.Time{}
	c.mu.Unlock()

	if err != nil {
		return err
	}

	if resp.IsError() {
		// Ignore logout errors
		return nil
	}

	return nil
}

// GetCurrentUser gets the current user information
func (c *Client) GetCurrentUser(ctx context.Context) (*User, error) {
	var user User
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetResult(&user).
		Get("/api/auth/me")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &user, nil
}

// Memory operations

// CreateMemoryOptions contains options for creating a memory
type CreateMemoryOptions struct {
	Content           string                 `json:"content"`
	Title             string                 `json:"title,omitempty"`
	Tags              []string               `json:"tags,omitempty"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
	Visibility        string                 `json:"visibility,omitempty"`
	GenerateEmbedding *bool                  `json:"generate_embedding,omitempty"`
}

// CreateMemory creates a new memory
func (c *Client) CreateMemory(ctx context.Context, opts CreateMemoryOptions) (*Memory, error) {
	// Set defaults
	if opts.Visibility == "" {
		opts.Visibility = "private"
	}
	if opts.GenerateEmbedding == nil {
		generateEmbedding := true
		opts.GenerateEmbedding = &generateEmbedding
	}

	var memory Memory
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetBody(opts).
		SetResult(&memory).
		Post("/api/memories")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &memory, nil
}

// GetMemory retrieves a memory by ID
func (c *Client) GetMemory(ctx context.Context, memoryID string) (*Memory, error) {
	var memory Memory
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetResult(&memory).
		Get(fmt.Sprintf("/api/memories/%s", memoryID))

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &memory, nil
}

// UpdateMemoryOptions contains options for updating a memory
type UpdateMemoryOptions struct {
	Content             *string                 `json:"content,omitempty"`
	Title               *string                 `json:"title,omitempty"`
	Tags                []string                `json:"tags,omitempty"`
	Metadata            map[string]interface{}  `json:"metadata,omitempty"`
	Visibility          *string                 `json:"visibility,omitempty"`
	RegenerateEmbedding bool                    `json:"regenerate_embedding"`
}

// UpdateMemory updates an existing memory
func (c *Client) UpdateMemory(ctx context.Context, memoryID string, opts UpdateMemoryOptions) (*Memory, error) {
	var memory Memory
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetBody(opts).
		SetResult(&memory).
		Put(fmt.Sprintf("/api/memories/%s", memoryID))

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &memory, nil
}

// DeleteMemory deletes a memory
func (c *Client) DeleteMemory(ctx context.Context, memoryID string) error {
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		Delete(fmt.Sprintf("/api/memories/%s", memoryID))

	if err != nil {
		return err
	}

	if resp.IsError() {
		return handleError(resp)
	}

	return nil
}

// ListMemoriesOptions contains options for listing memories
type ListMemoriesOptions struct {
	Limit      int      `url:"limit,omitempty"`
	Offset     int      `url:"offset,omitempty"`
	Tags       []string `url:"tags,omitempty"`
	Visibility []string `url:"visibility,omitempty"`
}

// ListMemoriesResponse represents the response from listing memories
type ListMemoriesResponse struct {
	Memories []Memory `json:"memories"`
	Total    int      `json:"total"`
}

// ListMemories lists memories with optional filters
func (c *Client) ListMemories(ctx context.Context, opts *ListMemoriesOptions) (*ListMemoriesResponse, error) {
	req := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken())

	if opts != nil {
		if opts.Limit > 0 {
			req.SetQueryParam("limit", fmt.Sprintf("%d", opts.Limit))
		}
		if opts.Offset > 0 {
			req.SetQueryParam("offset", fmt.Sprintf("%d", opts.Offset))
		}
		if len(opts.Tags) > 0 {
			req.SetQueryParamFromValues("tags", opts.Tags)
		}
		if len(opts.Visibility) > 0 {
			req.SetQueryParamFromValues("visibility", opts.Visibility)
		}
	}

	var result ListMemoriesResponse
	resp, err := req.
		SetResult(&result).
		Get("/api/memories")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &result, nil
}

// SearchOptions contains options for searching memories
type SearchOptions struct {
	Query               string    `url:"query"`
	SearchType          string    `url:"search_type,omitempty"`
	Limit               int       `url:"limit,omitempty"`
	Offset              int       `url:"offset,omitempty"`
	Tags                []string  `url:"tags,omitempty"`
	DateFrom            *time.Time `url:"date_from,omitempty"`
	DateTo              *time.Time `url:"date_to,omitempty"`
	Visibility          []string  `url:"visibility,omitempty"`
	SimilarityThreshold float64   `url:"similarity_threshold,omitempty"`
	KeywordWeight       float64   `url:"keyword_weight,omitempty"`
	SemanticWeight      float64   `url:"semantic_weight,omitempty"`
}

// Search searches memories
func (c *Client) Search(ctx context.Context, opts SearchOptions) (*SearchResult, error) {
	// Set defaults
	if opts.SearchType == "" {
		opts.SearchType = "hybrid"
	}
	if opts.Limit == 0 {
		opts.Limit = 10
	}
	if opts.SimilarityThreshold == 0 {
		opts.SimilarityThreshold = 0.7
	}
	if opts.KeywordWeight == 0 {
		opts.KeywordWeight = 0.5
	}
	if opts.SemanticWeight == 0 {
		opts.SemanticWeight = 0.5
	}

	req := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetQueryParam("query", opts.Query).
		SetQueryParam("search_type", opts.SearchType).
		SetQueryParam("limit", fmt.Sprintf("%d", opts.Limit)).
		SetQueryParam("offset", fmt.Sprintf("%d", opts.Offset)).
		SetQueryParam("similarity_threshold", fmt.Sprintf("%.2f", opts.SimilarityThreshold)).
		SetQueryParam("keyword_weight", fmt.Sprintf("%.2f", opts.KeywordWeight)).
		SetQueryParam("semantic_weight", fmt.Sprintf("%.2f", opts.SemanticWeight))

	if len(opts.Tags) > 0 {
		req.SetQueryParamFromValues("tags", opts.Tags)
	}
	if opts.DateFrom != nil {
		req.SetQueryParam("date_from", opts.DateFrom.Format(time.RFC3339))
	}
	if opts.DateTo != nil {
		req.SetQueryParam("date_to", opts.DateTo.Format(time.RFC3339))
	}
	if len(opts.Visibility) > 0 {
		req.SetQueryParamFromValues("visibility", opts.Visibility)
	}

	var result SearchResult
	resp, err := req.
		SetResult(&result).
		Get("/api/memories/search")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return &result, nil
}

// API Key operations

// CreateAPIKeyOptions contains options for creating an API key
type CreateAPIKeyOptions struct {
	Name        string     `json:"name"`
	Permissions []string   `json:"permissions,omitempty"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
}

// CreateAPIKey creates a new API key
func (c *Client) CreateAPIKey(ctx context.Context, opts CreateAPIKeyOptions) (string, error) {
	var result struct {
		APIKey string `json:"api_key"`
	}

	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetBody(opts).
		SetResult(&result).
		Post("/api/auth/api-keys")

	if err != nil {
		return "", err
	}

	if resp.IsError() {
		return "", handleError(resp)
	}

	return result.APIKey, nil
}

// ListAPIKeys lists all API keys
func (c *Client) ListAPIKeys(ctx context.Context) ([]APIKey, error) {
	var keys []APIKey
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetResult(&keys).
		Get("/api/auth/api-keys")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return keys, nil
}

// RevokeAPIKey revokes an API key
func (c *Client) RevokeAPIKey(ctx context.Context, keyID string) error {
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		Delete(fmt.Sprintf("/api/auth/api-keys/%s", keyID))

	if err != nil {
		return err
	}

	if resp.IsError() {
		return handleError(resp)
	}

	return nil
}

// GetStats gets user statistics
func (c *Client) GetStats(ctx context.Context) (map[string]interface{}, error) {
	var stats map[string]interface{}
	resp, err := c.httpClient.R().
		SetContext(ctx).
		SetAuthToken(c.getAuthToken()).
		SetResult(&stats).
		Get("/api/stats")

	if err != nil {
		return nil, err
	}

	if resp.IsError() {
		return nil, handleError(resp)
	}

	return stats, nil
}