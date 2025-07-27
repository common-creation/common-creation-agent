/**
 * LLM Error Handler Tests
 * エラーハンドラーのテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMErrorHandler } from './error-handler.js'
import { LLMError, LLMErrorType } from './types.js'

describe('LLMErrorHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('classifyError', () => {
    it('レート制限エラーを正しく分類する', () => {
      const errors = [
        new Error('Rate limit exceeded'),
        new Error('Too many requests'),
        new Error('Error 429: Rate limited'),
      ]

      errors.forEach((error) => {
        const llmError = LLMErrorHandler.classifyError(error, 'openai')
        expect(llmError).toBeInstanceOf(LLMError)
        expect(llmError.type).toBe(LLMErrorType.RATE_LIMIT)
        expect(llmError.provider).toBe('openai')
      })
    })

    it('認証エラーを正しく分類する', () => {
      const errors = [
        new Error('Unauthorized'),
        new Error('Invalid API key'),
        new Error('Authentication failed'),
        new Error('401 Unauthorized'),
        new Error('403 Forbidden'),
      ]

      errors.forEach((error) => {
        const llmError = LLMErrorHandler.classifyError(error, 'bedrock')
        expect(llmError.type).toBe(LLMErrorType.AUTHENTICATION)
      })
    })

    it('サービス利用不可エラーを正しく分類する', () => {
      const errors = [
        new Error('Service unavailable'),
        new Error('503 Service Unavailable'),
        new Error('500 Internal Server Error'),
        new Error('502 Bad Gateway'),
      ]

      errors.forEach((error) => {
        const llmError = LLMErrorHandler.classifyError(error, 'openai')
        expect(llmError.type).toBe(LLMErrorType.SERVICE_UNAVAILABLE)
      })
    })

    it('無効なリクエストエラーを正しく分類する', () => {
      const errors = [
        new Error('Invalid request'),
        new Error('Bad request'),
        new Error('400 Bad Request'),
      ]

      errors.forEach((error) => {
        const llmError = LLMErrorHandler.classifyError(error, 'bedrock')
        expect(llmError.type).toBe(LLMErrorType.INVALID_REQUEST)
      })
    })

    it('ネットワークエラーを正しく分類する', () => {
      const errors = [
        new Error('Network error'),
        new Error('Request timeout'),
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
      ]

      errors.forEach((error) => {
        const llmError = LLMErrorHandler.classifyError(error, 'openai')
        expect(llmError.type).toBe(LLMErrorType.NETWORK)
      })
    })

    it('不明なエラーをUNKNOWNとして分類する', () => {
      const error = new Error('Something went wrong')
      const llmError = LLMErrorHandler.classifyError(error, 'openai')
      expect(llmError.type).toBe(LLMErrorType.UNKNOWN)
    })

    it('文字列エラーを処理する', () => {
      const llmError = LLMErrorHandler.classifyError('Rate limit exceeded', 'openai')
      expect(llmError.message).toBe('Rate limit exceeded')
      expect(llmError.type).toBe(LLMErrorType.RATE_LIMIT)
    })

    it('未知の型のエラーを処理する', () => {
      const llmError = LLMErrorHandler.classifyError({ error: 'unknown' }, 'openai')
      expect(llmError.message).toBe('Unknown error occurred')
      expect(llmError.type).toBe(LLMErrorType.UNKNOWN)
    })

    it('Retry-Afterヘッダーを抽出する', () => {
      const errorWithHeaders = {
        message: 'Rate limited',
        headers: {
          'retry-after': '60',
        },
      }

      const llmError = LLMErrorHandler.classifyError(errorWithHeaders, 'openai')
      expect(llmError.retryAfter).toBe(60000) // 60秒 = 60000ミリ秒
    })
  })

  describe('exponentialBackoff', () => {
    it('指数バックオフで待機時間が増加する', async () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      }

      // 1回目の試行
      const promise1 = LLMErrorHandler.exponentialBackoff(0, config)
      vi.runAllTimers()
      await promise1

      // 2回目の試行
      const promise2 = LLMErrorHandler.exponentialBackoff(1, config)
      vi.runAllTimers()
      await promise2

      // 3回目の試行
      const promise3 = LLMErrorHandler.exponentialBackoff(2, config)
      vi.runAllTimers()
      await promise3

      // 待機時間が増加していることを確認（ジッターがあるため範囲で確認）
      expect(vi.getTimerCount()).toBe(0)
    })

    it('最大遅延時間を超えない', async () => {
      const config = {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 2000,
        backoffMultiplier: 10,
      }

      const spy = vi.spyOn(global, 'setTimeout')

      // 大きな試行回数でも最大遅延時間を超えないことを確認
      const promise = LLMErrorHandler.exponentialBackoff(10, config)

      expect(spy).toHaveBeenCalledWith(expect.any(Function), expect.any(Number))
      const delay = spy.mock.calls[0][1] as number
      expect(delay).toBeLessThanOrEqual(2000 * 1.2) // ジッターの最大値を考慮

      vi.runAllTimers()
      await promise

      spy.mockRestore()
    })

    it('retryAfterが指定されている場合はそれを使用する', async () => {
      const spy = vi.spyOn(global, 'setTimeout')

      const promise = LLMErrorHandler.exponentialBackoff(0, undefined, 5000)

      expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000)

      vi.runAllTimers()
      await promise

      spy.mockRestore()
    })
  })

  describe('isRetryable', () => {
    it('リトライ可能なエラータイプを判定する', () => {
      const retryableTypes = [
        LLMErrorType.RATE_LIMIT,
        LLMErrorType.SERVICE_UNAVAILABLE,
        LLMErrorType.NETWORK,
      ]

      retryableTypes.forEach((type) => {
        const error = new LLMError('test', type, 'openai')
        expect(LLMErrorHandler.isRetryable(error)).toBe(true)
      })
    })

    it('リトライ不可能なエラータイプを判定する', () => {
      const nonRetryableTypes = [
        LLMErrorType.AUTHENTICATION,
        LLMErrorType.INVALID_REQUEST,
        LLMErrorType.UNKNOWN,
      ]

      nonRetryableTypes.forEach((type) => {
        const error = new LLMError('test', type, 'openai')
        expect(LLMErrorHandler.isRetryable(error)).toBe(false)
      })
    })
  })

  describe('getUserFriendlyMessage', () => {
    it('各エラータイプに対して適切なメッセージを返す', () => {
      const testCases = [
        {
          type: LLMErrorType.RATE_LIMIT,
          expected: 'システムが一時的に混雑しています。しばらくお待ちください。',
        },
        {
          type: LLMErrorType.AUTHENTICATION,
          expected: '認証エラーが発生しました。設定を確認してください。',
        },
        {
          type: LLMErrorType.SERVICE_UNAVAILABLE,
          expected: 'サービスが一時的に利用できません。しばらくお待ちください。',
        },
        {
          type: LLMErrorType.INVALID_REQUEST,
          expected: 'リクエストが無効です。入力内容を確認してください。',
        },
        {
          type: LLMErrorType.NETWORK,
          expected: 'ネットワークエラーが発生しました。接続を確認してください。',
        },
        {
          type: LLMErrorType.UNKNOWN,
          expected: '予期しないエラーが発生しました。',
        },
      ]

      testCases.forEach(({ type, expected }) => {
        const error = new LLMError('test', type, 'openai')
        const message = LLMErrorHandler.getUserFriendlyMessage(error)
        expect(message).toBe(expected)
      })
    })
  })
})
