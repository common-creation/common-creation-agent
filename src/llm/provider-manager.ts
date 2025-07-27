/**
 * LLM Model Factory
 * LLMモデルファクトリ
 */

import { bedrock } from '@ai-sdk/amazon-bedrock'
import { createOpenAI, openai } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Logger } from '../core/interfaces.js'
import { LLMErrorHandler } from './error-handler.js'
import {
  LLMError,
  LLMErrorType,
  type ModelFactory,
  type ProviderConfig,
  type EmbeddingConfig,
  type ProviderType,
} from './types.js'

export class ModelFactoryImpl implements ModelFactory {
  private logger?: Logger

  constructor(logger?: Logger) {
    this.logger = logger
  }

  /**
   * モデルインスタンスを取得
   */
  getModel(config: ProviderConfig): any {
    switch (config.provider) {
      case 'openai':
        return this.getOpenAIModel(config)
      case 'bedrock':
        return this.getBedrockModel(config)
      default:
        throw new LLMError(
          `Unsupported provider: ${config.provider}`,
          LLMErrorType.INVALID_REQUEST,
          config.provider
        )
    }
  }

  /**
   * Embeddingモデルインスタンスを取得
   */
  getEmbeddingModel(config: EmbeddingConfig): any {
    switch (config.provider) {
      case 'openai':
        return this.getOpenAIEmbeddingModel(config)
      case 'bedrock':
        return this.getBedrockEmbeddingModel(config)
      default:
        throw new LLMError(
          `Unsupported embedding provider: ${config.provider}`,
          LLMErrorType.INVALID_REQUEST,
          config.provider
        )
    }
  }

  /**
   * 環境変数を設定
   */
  setupEnvironment(config: ProviderConfig | EmbeddingConfig): void {
    switch (config.provider) {
      case 'openai': {
        const beforeKey = this.maskApiKey(process.env.OPENAI_API_KEY)
        const configKey = this.maskApiKey(config.apiKey)

        this.logger?.info('OpenAI API key setup', {
          existingKey: beforeKey,
          configKey,
        })

        if (config.apiKey) {
          process.env.OPENAI_API_KEY = config.apiKey
        }

        const afterKey = this.maskApiKey(process.env.OPENAI_API_KEY)
        this.logger?.info('OpenAI API key after setup', {
          effectiveKey: afterKey,
        })
        break
      }

      case 'bedrock':
        if ('region' in config && config.region) {
          process.env.AWS_REGION = config.region
        }
        if ('accessKeyId' in config && config.accessKeyId) {
          process.env.AWS_ACCESS_KEY_ID = config.accessKeyId
        }
        if ('secretAccessKey' in config && config.secretAccessKey) {
          process.env.AWS_SECRET_ACCESS_KEY = config.secretAccessKey
        }
        break
    }
  }

  /**
   * OpenAIモデルを取得
   */
  private getOpenAIModel(config: ProviderConfig): any {
    if (!config.apiKey) {
      throw new LLMError('OpenAI API key is required', LLMErrorType.AUTHENTICATION, 'openai')
    }

    const sanitizedBaseUrl = config.baseUrl ?? '(default:https://api.openai.com/v1)'
    this.logger?.info('OpenAI baseUrl configuration', {
      baseUrl: sanitizedBaseUrl,
    })

    // baseUrlが設定されている場合はカスタムエンドポイントを使用
    if (config.baseUrl) {
      this.logger?.info(`Using custom OpenAI-compatible endpoint: ${config.baseUrl}, ${config.apiKey.substring(0,8)}***`)

      const customOpenAI = createOpenAICompatible({
        name: 'Custom OpenAI Compatible',
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      })

      return customOpenAI(config.model)
    }
    
    return openai(config.model)
  }

  /**
   * OpenAI Embeddingモデルを取得
   */
  private getOpenAIEmbeddingModel(config: EmbeddingConfig): any {
    if (!config.apiKey) {
      throw new LLMError('OpenAI API key is required for embedding', LLMErrorType.AUTHENTICATION, 'openai')
    }

    // baseUrlが設定されている場合はカスタムエンドポイントを使用
    if (config.baseUrl) {
      this.logger?.info(`Using custom OpenAI-compatible embedding endpoint: ${config.baseUrl}`)

      const customOpenAI = createOpenAICompatible({
        name: 'Custom OpenAI Compatible Embedding',
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      })

      // createOpenAICompatibleから直接embeddingモデルを作成
      return customOpenAI(config.model)
    }
    
    const openaiInstance = createOpenAI({
      apiKey: config.apiKey,
    })
    return openaiInstance.embedding(config.model)
  }

  /**
   * Bedrockモデルを取得
   */
  private getBedrockModel(config: ProviderConfig): any {
    if (!config.region) {
      throw new LLMError(
        'AWS region is required for Bedrock',
        LLMErrorType.AUTHENTICATION,
        'bedrock'
      )
    }

    // AWS認証情報の確認
    if (!config.accessKeyId && !config.secretAccessKey) {
      this.logger?.info(
        'AWS credentials not found in config. IAM role will be used for authentication.'
      )
    }

    return bedrock(config.model)
  }

  /**
   * Bedrock Embeddingモデルを取得
   */
  private getBedrockEmbeddingModel(config: EmbeddingConfig): any {
    if (!config.region) {
      throw new LLMError(
        'AWS region is required for Bedrock embedding',
        LLMErrorType.AUTHENTICATION,
        'bedrock'
      )
    }

    // AWS認証情報の確認
    if (!config.accessKeyId && !config.secretAccessKey) {
      this.logger?.info(
        'AWS credentials not found in config. IAM role will be used for authentication.'
      )
    }

    return bedrock.embedding(config.model)
  }

  /**
   * エラーハンドリング
   */
  async handleError(error: unknown, provider: ProviderType): Promise<void> {
    const llmError = LLMErrorHandler.classifyError(error, provider)

    this.logger?.error(`LLM Error [${provider}]`, {
      type: llmError.type,
      message: llmError.message,
      retryAfter: llmError.retryAfter,
    })

    throw llmError
  }

  private maskApiKey(key?: string): string {
    if (!key) {
      return '(undefined)'
    }

    if (key.length <= 8) {
      return `${key.slice(0, 2)}***${key.slice(-1)}`
    }

    return `${key.slice(0, 4)}***${key.slice(-4)}`
  }
}
