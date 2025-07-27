/**
 * Agent Types
 * エージェント関連の型定義
 */

import type { Agent } from '@voltagent/core'
import type { AgentResponse, ConversationContext, ContentPart } from '../core/types.js'

/**
 * エージェント設定
 */
export interface AgentSettings {
  id: string
  name: string
  description: string
  instructions: string
  systemPrompt?: string
}

/**
 * エージェントマネージャーインターフェース
 */
export interface AgentManager {
  initialize(): Promise<void>
  getAgent(): Agent
  processMessage(message: string | ContentPart[], context: ConversationContext, options?: MessageProcessingOptions): Promise<AgentResponse>
  shutdown(): Promise<void>
}

/**
 * 会話セッション
 */
export interface ConversationSession {
  id: string
  userId: string
  startTime: Date
  lastActivity: Date
  messageCount: number
  context: ConversationContext
}

/**
 * セッションマネージャーインターフェース
 */
export interface SessionManager {
  createSession(userId: string, channelId?: string): ConversationSession
  getSession(sessionId: string): ConversationSession | undefined
  updateSession(sessionId: string, context: ConversationContext): void
  removeSession(sessionId: string): void
  getActiveSessions(): ConversationSession[]
  cleanupInactiveSessions(maxInactiveMinutes: number): void
}

/**
 * メッセージ処理オプション
 */
export interface MessageProcessingOptions {
  streamMode?: boolean
  includeHistory?: boolean
  maxHistoryMessages?: number
  userId?: string
  conversationId?: string
}
