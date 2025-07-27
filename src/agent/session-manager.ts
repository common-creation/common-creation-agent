/**
 * Session Manager
 * セッション管理の実装
 */

import { v4 as uuidv4 } from 'uuid'
import type { Logger } from '../core/interfaces.js'
import type { ConversationContext, Message } from '../core/types.js'
import type { ConversationSession, SessionManager } from './types.js'

export class SessionManagerImpl implements SessionManager {
  private sessions: Map<string, ConversationSession> = new Map()
  private logger?: Logger

  constructor(logger?: Logger) {
    this.logger = logger
  }

  /**
   * 新しいセッションを作成
   */
  createSession(userId: string, channelId?: string): ConversationSession {
    const sessionId = uuidv4()
    const now = new Date()

    const context: ConversationContext = {
      sessionId,
      userId,
      channelId,
      history: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }

    const session: ConversationSession = {
      id: sessionId,
      userId,
      startTime: now,
      lastActivity: now,
      messageCount: 0,
      context,
    }

    this.sessions.set(sessionId, session)
    this.logger?.info(`Session created: ${sessionId} for user: ${userId}`)

    return session
  }

  /**
   * セッションを取得
   */
  getSession(sessionId: string): ConversationSession | undefined {
    const session = this.sessions.get(sessionId)
    if (session) {
      // 最終アクティビティ時刻を更新
      session.lastActivity = new Date()
    }
    return session
  }

  /**
   * セッションを更新
   */
  updateSession(sessionId: string, context: ConversationContext): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      this.logger?.warn(`Session not found for update: ${sessionId}`)
      return
    }

    session.context = context
    session.lastActivity = new Date()
    session.messageCount = context.history.length

    this.logger?.debug(`Session updated: ${sessionId}, messages: ${session.messageCount}`)
  }

  /**
   * セッションを削除
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    this.sessions.delete(sessionId)
    this.logger?.info(`Session removed: ${sessionId}`)
  }

  /**
   * アクティブなセッション一覧を取得
   */
  getActiveSessions(): ConversationSession[] {
    return Array.from(this.sessions.values())
  }

  /**
   * 非アクティブなセッションをクリーンアップ
   */
  cleanupInactiveSessions(maxInactiveMinutes: number): void {
    const now = new Date()
    const maxInactiveMs = maxInactiveMinutes * 60 * 1000
    const sessionsToRemove: string[] = []

    this.sessions.forEach((session, sessionId) => {
      const inactiveTime = now.getTime() - session.lastActivity.getTime()
      if (inactiveTime > maxInactiveMs) {
        sessionsToRemove.push(sessionId)
      }
    })

    sessionsToRemove.forEach((sessionId) => {
      this.removeSession(sessionId)
    })

    if (sessionsToRemove.length > 0) {
      this.logger?.info(`Cleaned up ${sessionsToRemove.length} inactive sessions`)
    }
  }

  /**
   * メッセージを会話履歴に追加
   */
  addMessageToHistory(sessionId: string, message: Message, maxHistorySize = 100): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      this.logger?.warn(`Session not found for message: ${sessionId}`)
      return
    }

    // 履歴に追加
    session.context.history.push(message)

    // 履歴サイズの制限
    if (session.context.history.length > maxHistorySize) {
      // 古いメッセージを削除（システムメッセージは保持）
      const systemMessages = session.context.history.filter((m) => m.role === 'system')
      const nonSystemMessages = session.context.history.filter((m) => m.role !== 'system')

      const messagesToKeep = nonSystemMessages.slice(-maxHistorySize + systemMessages.length)
      session.context.history = [...systemMessages, ...messagesToKeep]
    }

    // コンテキストを更新
    session.context.updatedAt = new Date()
    this.updateSession(sessionId, session.context)
  }

  /**
   * セッション統計を取得
   */
  getSessionStats(): {
    totalSessions: number
    activeSessions: number
    averageMessageCount: number
  } {
    const sessions = this.getActiveSessions()
    const totalSessions = sessions.length

    if (totalSessions === 0) {
      return {
        totalSessions: 0,
        activeSessions: 0,
        averageMessageCount: 0,
      }
    }

    const now = new Date()
    const fiveMinutesAgo = now.getTime() - 5 * 60 * 1000
    const activeSessions = sessions.filter((s) => s.lastActivity.getTime() > fiveMinutesAgo).length

    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0)
    const averageMessageCount = Math.round(totalMessages / totalSessions)

    return {
      totalSessions,
      activeSessions,
      averageMessageCount,
    }
  }
}
