/**
 * LLM Error Handler
 * LLMエラーハンドリング
 */

import { LLMError, LLMErrorType, type ProviderType, type RetryConfig } from './types.js'

export class LLMErrorHandler {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  }

  /**
   * エラーを分類してLLMErrorに変換
   */
  static classifyError(error: unknown, provider: ProviderType): LLMError {
    const errorMessage = LLMErrorHandler.getErrorMessage(error)
    const errorType = LLMErrorHandler.detectErrorType(error, errorMessage)
    const retryAfter = LLMErrorHandler.extractRetryAfter(error)

    return new LLMError(errorMessage, errorType, provider, retryAfter, error)
  }

  /**
   * エラーメッセージを取得
   */
  private static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    return 'Unknown error occurred'
  }

  /**
   * エラータイプを検出
   */
  private static detectErrorType(error: unknown, message: string): LLMErrorType {
    const lowerMessage = message.toLowerCase()

    // レート制限
    if (
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('too many requests') ||
      lowerMessage.includes('429')
    ) {
      return LLMErrorType.RATE_LIMIT
    }

    // 認証エラー
    if (
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('authentication') ||
      lowerMessage.includes('api key') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('403')
    ) {
      return LLMErrorType.AUTHENTICATION
    }

    // サービス利用不可
    if (
      lowerMessage.includes('service unavailable') ||
      lowerMessage.includes('503') ||
      lowerMessage.includes('500') ||
      lowerMessage.includes('502')
    ) {
      return LLMErrorType.SERVICE_UNAVAILABLE
    }

    // 無効なリクエスト
    if (
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('bad request') ||
      lowerMessage.includes('400')
    ) {
      return LLMErrorType.INVALID_REQUEST
    }

    // ネットワークエラー
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('enotfound')
    ) {
      return LLMErrorType.NETWORK
    }

    return LLMErrorType.UNKNOWN
  }

  /**
   * Retry-Afterヘッダーの値を抽出
   */
  private static extractRetryAfter(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'headers' in error) {
      const headers = (error as any).headers
      if (headers && typeof headers === 'object') {
        const retryAfter = headers['retry-after'] || headers['Retry-After']
        if (retryAfter) {
          const seconds = parseInt(retryAfter, 10)
          if (!isNaN(seconds)) {
            return seconds * 1000 // ミリ秒に変換
          }
        }
      }
    }
    return undefined
  }

  /**
   * 指数バックオフによる待機
   */
  static async exponentialBackoff(
    attempt: number,
    config: RetryConfig = LLMErrorHandler.DEFAULT_RETRY_CONFIG,
    retryAfter?: number
  ): Promise<void> {
    if (retryAfter) {
      await LLMErrorHandler.delay(retryAfter)
      return
    }

    const delay = Math.min(
      config.initialDelayMs * config.backoffMultiplier ** attempt,
      config.maxDelayMs
    )

    // ジッターを追加（0.8〜1.2倍のランダム化）
    const jitter = 0.8 + Math.random() * 0.4
    const finalDelay = Math.floor(delay * jitter)

    await LLMErrorHandler.delay(finalDelay)
  }

  /**
   * 遅延処理
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * リトライ可能なエラーかどうか判定
   */
  static isRetryable(error: LLMError): boolean {
    return [
      LLMErrorType.RATE_LIMIT,
      LLMErrorType.SERVICE_UNAVAILABLE,
      LLMErrorType.NETWORK,
    ].includes(error.type)
  }

  /**
   * ユーザー向けエラーメッセージを生成
   */
  static getUserFriendlyMessage(error: LLMError): string {
    switch (error.type) {
      case LLMErrorType.RATE_LIMIT:
        return 'システムが一時的に混雑しています。しばらくお待ちください。'
      case LLMErrorType.AUTHENTICATION:
        return '認証エラーが発生しました。設定を確認してください。'
      case LLMErrorType.SERVICE_UNAVAILABLE:
        return 'サービスが一時的に利用できません。しばらくお待ちください。'
      case LLMErrorType.INVALID_REQUEST:
        return 'リクエストが無効です。入力内容を確認してください。'
      case LLMErrorType.NETWORK:
        return 'ネットワークエラーが発生しました。接続を確認してください。'
      default:
        return '予期しないエラーが発生しました。'
    }
  }
}
