/**
 * LLM Model Factory Types
 * LLMモデルファクトリ関連の型定義
 */

/**
 * サポートされるプロバイダータイプ
 */
export type ProviderType = 'openai' | 'bedrock'

/**
 * プロバイダー固有のモデルタイプ
 */
export type ModelType = string

/**
 * LLMエラーの種類
 */
export enum LLMErrorType {
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  INVALID_REQUEST = 'invalid_request',
  NETWORK = 'network',
  UNKNOWN = 'unknown',
}

/**
 * LLMエラー
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly type: LLMErrorType,
    public readonly provider: ProviderType,
    public readonly retryAfter?: number,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'LLMError'
  }
}

/**
 * プロバイダー設定
 */
export interface ProviderConfig {
  provider: ProviderType
  model: string
  apiKey?: string
  baseUrl?: string // OpenAI互換サーバーのベースURL (LM Studioなど)
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  reasoning?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high'
  }
}

/**
 * Embedding設定
 */
export interface EmbeddingConfig {
  provider: ProviderType
  model: string
  apiKey?: string // メインLLMとは別のキーを設定可能
  baseUrl?: string // OpenAI互換サーバーのベースURL
  region?: string // AWS Bedrock用
  accessKeyId?: string // AWS Bedrock用
  secretAccessKey?: string // AWS Bedrock用
}

/**
 * メモリ設定
 */
export interface MemoryConfig {
  enabled: boolean
  path: string // LibSQLファイルパス (例: file:./data/memory.db)
  vector?: {
    enabled: boolean
  }
  embedding?: EmbeddingConfig
  workingMemory?: {
    enabled: boolean
    // 将来のスキーマ定義用
  }
}

/**
 * LLMモデルファクトリインターフェース
 */
export interface ModelFactory {
  getModel(config: ProviderConfig): any // ai-sdk LanguageModel
  getEmbeddingModel(config: EmbeddingConfig): any // ai-sdk EmbeddingModel
  setupEnvironment(config: ProviderConfig | EmbeddingConfig): void
}

/**
 * リトライ設定
 */
export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}
