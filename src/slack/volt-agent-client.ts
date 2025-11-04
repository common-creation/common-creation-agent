/**
 * VoltAgent Client
 * VoltAgent APIとの通信を行うクライアント
 */

import type { Logger } from '../core/interfaces.js'
import type { ContentPart } from '../core/types.js'
import type { AgentApiResponse, VoltAgentClient } from './types.js'

// VoltAgent APIレスポンスの型定義
interface VoltAgentApiResponse {
  success: boolean
  data?: {
    text: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
    toolCalls?: Array<{
      toolName: string
      args: any
    }>
    finishReason?: string
  }
  error?: string
}

export class VoltAgentApiClient implements VoltAgentClient {
  private baseUrl: string
  private logger?: Logger
  private timeout: number

  constructor(
    baseUrl: string = 'http://localhost:3141', 
    logger?: Logger, 
    timeout: number = 120000
  ) {
    this.baseUrl = baseUrl
    this.logger = logger
    this.timeout = timeout
  }

  /**
   * VoltAgent APIにメッセージを送信
   */
  async sendMessage(
    message: string,
    sessionId: string,
    userId: string,
    channelId?: string,
    threadHistoryContext?: string
  ): Promise<AgentApiResponse> {
    const url = `${this.baseUrl}/agents/main/text-custom`

    // 送信前に message を安全化
    const safeMessage = typeof message === 'string' ? message : (() => {
      try { return JSON.stringify(message) } catch { return String(message) }
    })()

    // スレッド履歴がある場合は入力の先頭に追加
    const finalInput = threadHistoryContext
      ? `${threadHistoryContext}\n\n${safeMessage}`
      : safeMessage

    const requestBody = {
      input: finalInput,
      options: {
        userId: userId,
        conversationId: sessionId,
        contextLimit: 200,
        temperature: 1, // 固定値
      },
    }

    this.logger?.debug('Sending message to VoltAgent API', {
      url,
      sessionId,
      userId,
      channelId,
      requestBody
    })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`VoltAgent API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as VoltAgentApiResponse

      this.logger?.debug('Received response from VoltAgent API', {
        success: data.success,
        hasData: !!data.data,
        data: data.data,
      })

      // VoltAgentのレスポンス形式をAgentApiResponse形式に変換
      return {
        response: {
          content: data.data?.text || '', // VoltAgent APIレスポンスは { success: true, data: { text: "..." } }
          toolCalls: data.data?.toolCalls || undefined,
          metadata: {
            usage: data.data?.usage,
            finishReason: data.data?.finishReason,
          },
          error: data.success === false ? data.error : undefined,
        },
        sessionId: sessionId, // セッションIDはリクエストから維持
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`VoltAgent API timeout after ${this.timeout}ms`)
        }
        throw error
      }
      throw new Error('Unknown error occurred while calling VoltAgent API')
    }
  }

  /**
   * VoltAgent APIにマルチモーダルメッセージを送信
   */
  async sendMultiModalMessage(
    content: ContentPart[],
    sessionId: string,
    userId: string,
    channelId?: string,
    threadHistoryContext?: string
  ): Promise<AgentApiResponse> {
    const url = `${this.baseUrl}/agents/main/text-custom`

    // VoltAgentのマルチモーダルフォーマットに変換
    // 現状バックエンドは text のみを期待するため、複合 content から text 部分を抽出し残りは JSON として連結
    const textParts = content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text.trim())
      .filter(t => t.length > 0)
    const nonTextParts = content.filter((c): c is { type: 'image'; image: string; mimeType?: string } => c.type === 'image')

    let combined: string = ''

    // スレッド履歴がある場合は先頭に追加
    if (threadHistoryContext) {
      combined = threadHistoryContext + '\n\n'
    }

    if (textParts.length > 0) {
      combined += textParts.join('\n')
    }
    if (nonTextParts.length > 0) {
      try {
        combined += (combined ? '\n\n' : '') + '[MEDIA]\n' + JSON.stringify(nonTextParts.map(p => ({
          type: p.type,
          mimeType: p.mimeType,
          // 画像はサイズが大きいので先頭 100 chars のみ（不要に巨大化させない）
          imagePreview: typeof p.image === 'string' ? p.image.slice(0, 100) + '...' : undefined,
        })))
      } catch {
        combined += '\n[MEDIA]\n<serialization_failed>'
      }
    }

    const requestBody = {
      input: combined,
      options: {
        userId: userId,
        conversationId: sessionId,
        contextLimit: 200,
        temperature: 1, // 固定値
      },
    }

    this.logger?.debug('Sending multimodal message to VoltAgent API', {
      url,
      sessionId,
      userId,
      channelId,
      contentTypes: content.map(c => c.type),
    })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`VoltAgent API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as VoltAgentApiResponse

      this.logger?.debug('Received response from VoltAgent API', {
        success: data.success,
        hasData: !!data.data,
      })

      // VoltAgentのレスポンス形式をAgentApiResponse形式に変換
      return {
        response: {
          content: data.data?.text || '',
          toolCalls: data.data?.toolCalls || undefined,
          metadata: {
            usage: data.data?.usage,
            finishReason: data.data?.finishReason,
          },
          error: data.success === false ? data.error : undefined,
        },
        sessionId: sessionId,
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`VoltAgent API timeout after ${this.timeout}ms`)
        }
        throw error
      }
      throw new Error('Unknown error occurred while calling VoltAgent API')
    }
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      return response.ok
    } catch (error) {
      this.logger?.error('Health check failed', error)
      return false
    }
  }
}
