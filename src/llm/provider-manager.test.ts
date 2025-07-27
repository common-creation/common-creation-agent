/**
 * Provider Manager Tests
 * プロバイダーマネージャーのテスト
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '../core/interfaces.js'
import { ProviderManager } from './provider-manager.js'
import { LLMError, LLMErrorType, type ProviderConfig } from './types.js'

// モックロガー
const mockLogger: Logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}

describe('ProviderManager', () => {
  let providerManager: ProviderManager
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // 環境変数を保存
    originalEnv = { ...process.env }
    providerManager = new ProviderManager(mockLogger)
    vi.clearAllMocks()
  })

  afterEach(() => {
    // 環境変数を復元
    process.env = originalEnv
  })

  describe('getProvider', () => {
    it('OpenAIプロバイダーを正しく初期化する', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }

      const provider = providerManager.getProvider(config)

      expect(provider).toBeDefined()
      expect(provider.constructor.name).toBe('VercelAIProvider')
      expect(process.env.OPENAI_API_KEY).toBe('test-api-key')
      expect(mockLogger.info).toHaveBeenCalledWith('LLM provider initialized: openai')
    })

    it('Bedrockプロバイダーを正しく初期化する', () => {
      const config: ProviderConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
      }

      const provider = providerManager.getProvider(config)

      expect(provider).toBeDefined()
      expect(provider.constructor.name).toBe('VercelAIProvider')
      expect(process.env.AWS_REGION).toBe('us-east-1')
      expect(mockLogger.info).toHaveBeenCalledWith('LLM provider initialized: bedrock')
    })

    it('同じプロバイダーの場合はキャッシュを返す', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }

      const provider1 = providerManager.getProvider(config)
      const provider2 = providerManager.getProvider(config)

      expect(provider1).toBe(provider2)
      expect(mockLogger.info).toHaveBeenCalledTimes(1)
    })

    it('異なるプロバイダーの場合は新しいインスタンスを作成する', () => {
      const openaiConfig: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }

      const bedrockConfig: ProviderConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
      }

      const provider1 = providerManager.getProvider(openaiConfig)
      const provider2 = providerManager.getProvider(bedrockConfig)

      expect(provider1).not.toBe(provider2)
      expect(mockLogger.info).toHaveBeenCalledTimes(2)
    })

    it('必須パラメータがない場合エラーを投げる', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: '',
      }

      expect(() => providerManager.getProvider(config)).toThrow(LLMError)
    })
  })

  describe('getModel', () => {
    it('OpenAIモデルを正しく取得する', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }

      const model = providerManager.getModel(config)

      expect(model).toBeDefined()
      expect(model.modelId).toBe('gpt-4o-mini')
    })

    it('OpenAIモデルをbaseUrl付きで正しく取得する', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
        baseUrl: 'http://localhost:1234/v1',
      }

      const model = providerManager.getModel(config)

      expect(model).toBeDefined()
      expect(model.modelId).toBe('gpt-4o-mini')
      expect(mockLogger.info).toHaveBeenCalledWith('Using custom OpenAI-compatible endpoint: http://localhost:1234/v1')
    })

    it('baseUrlがない場合はデフォルトのOpenAIエンドポイントを使用する', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }

      const model = providerManager.getModel(config)

      expect(model).toBeDefined()
      expect(model.modelId).toBe('gpt-4o-mini')
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Using custom OpenAI-compatible endpoint')
      )
    })

    it('Bedrockモデルを正しく取得する', () => {
      // テスト用のAWS認証情報を設定
      process.env.AWS_ACCESS_KEY_ID = 'test-access-key'
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key'

      const config: ProviderConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
      }

      const model = providerManager.getModel(config)

      expect(model).toBeDefined()
      expect(model.modelId).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0')
    })

    it('OpenAIでAPIキーがない場合エラーを投げる', () => {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
      }

      delete process.env.OPENAI_API_KEY

      expect(() => providerManager.getModel(config)).toThrow(LLMError)
      expect(() => providerManager.getModel(config)).toThrow('OpenAI API key is required')
    })

    it('Bedrockでリージョンがない場合エラーを投げる', () => {
      const config: ProviderConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      }

      delete process.env.AWS_REGION

      expect(() => providerManager.getModel(config)).toThrow(LLMError)
      expect(() => providerManager.getModel(config)).toThrow('AWS region is required')
    })

    it('サポートされていないプロバイダーの場合エラーを投げる', () => {
      const config: ProviderConfig = {
        provider: 'unsupported' as any,
        model: 'some-model',
      }

      expect(() => providerManager.getModel(config)).toThrow(LLMError)
      expect(() => providerManager.getModel(config)).toThrow('Unsupported provider')
    })
  })

  describe('handleError', () => {
    it('エラーを分類してLLMErrorとして投げる', async () => {
      const originalError = new Error('Rate limit exceeded')

      await expect(providerManager.handleError(originalError, 'openai')).rejects.toThrow(LLMError)

      expect(mockLogger.error).toHaveBeenCalledWith(
        'LLM Error [openai]',
        expect.objectContaining({
          type: LLMErrorType.RATE_LIMIT,
          message: 'Rate limit exceeded',
        })
      )
    })

    it('認証エラーの場合プロバイダーキャッシュをクリアする', async () => {
      // プロバイダーを初期化してキャッシュを作成
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-api-key',
      }
      providerManager.getProvider(config)

      // 認証エラーを発生させる
      const authError = new Error('Invalid API key')

      try {
        await providerManager.handleError(authError, 'openai')
      } catch (error) {
        // エラーは予期される
      }

      // 新しいプロバイダーが作成されることを確認
      const provider2 = providerManager.getProvider(config)
      expect(mockLogger.info).toHaveBeenCalledTimes(2) // 2回初期化される
    })
  })

  describe('環境変数の管理', () => {
    it('OpenAI APIキーを環境変数に設定する', () => {
      delete process.env.OPENAI_API_KEY

      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'new-api-key',
      }

      providerManager.getProvider(config)

      expect(process.env.OPENAI_API_KEY).toBe('new-api-key')
    })

    it('既存の環境変数を優先する', () => {
      process.env.OPENAI_API_KEY = 'existing-key'

      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        // apiKeyを指定しない
      }

      // エラーが発生しないことを確認
      expect(() => providerManager.getProvider(config)).not.toThrow()
    })

    it('BedrockでAWS認証情報がない場合警告を出力する', () => {
      delete process.env.AWS_ACCESS_KEY_ID
      delete process.env.AWS_SECRET_ACCESS_KEY

      const config: ProviderConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
      }

      // AWS SDKがエラーを投げる前に警告が出力されることを確認
      try {
        providerManager.getModel(config)
      } catch (error) {
        // AWS SDKのエラーは無視
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'AWS credentials not found in environment variables'
      )
    })
  })
})
