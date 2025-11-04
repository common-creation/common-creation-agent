/**
 * Slack Types
 * Slack統合に関する型定義
 */

import type { App } from '@slack/bolt'
import type { Logger } from '../core/interfaces.js'
import type { ContentPart } from '../core/types.js'

/**
 * Slackメッセージコンテキスト
 */
export interface SlackMessageContext {
  userId: string
  userName?: string
  channelId: string
  channelName?: string
  threadTs?: string
  teamId?: string
  ts: string
}

/**
 * Slackスレッドメッセージ
 */
export interface ThreadMessage {
  user: string
  text: string
  ts: string
  botId?: string
  userName?: string
}

/**
 * Slackアプリケーション設定
 */
export interface SlackConfig {
  botToken: string
  appToken: string
  signingSecret: string
  socketMode?: boolean
}

/**
 * Slackサービスインターフェース
 */
export interface SlackService {
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(channelId: string, message: string, threadTs?: string): Promise<void>
  sendErrorMessage(channelId: string, error: string, threadTs?: string): Promise<void>
  addReaction(channelId: string, timestamp: string, reaction: string): Promise<void>
  removeReaction(channelId: string, timestamp: string, reaction: string): Promise<void>
  downloadFileAsBase64(file: SlackFile): Promise<string>
  getThreadReplies(channelId: string, threadTs: string, limit?: number): Promise<ThreadMessage[]>
  isChannel(channelId: string): Promise<boolean>
}

/**
 * Slackファイル情報
 */
export interface SlackFile {
  id: string
  name: string
  title?: string
  mimetype: string
  filetype: string
  size: number
  url_private: string
  url_private_download?: string
  thumb_360?: string
  thumb_480?: string
  thumb_720?: string
}

/**
 * Slackファイル共有イベント
 */
export interface SlackFileShareEvent {
  type: string
  subtype: 'file_share'
  files: SlackFile[]
  channel: string
  user: string
  ts: string
  thread_ts?: string
  text?: string
}

/**
 * Slackイベントハンドラー
 */
export interface SlackEventHandler {
  handleMention(event: any, context: SlackMessageContext): Promise<void>
  handleMessage(event: any, context: SlackMessageContext): Promise<void>
  handleFileShare(event: SlackFileShareEvent, context: SlackMessageContext): Promise<void>
}

/**
 * VoltAgent APIクライアント
 */
export interface VoltAgentClient {
  sendMessage(
    message: string,
    sessionId: string,
    userId: string,
    channelId?: string,
    threadHistoryContext?: string
  ): Promise<AgentApiResponse>

  sendMultiModalMessage(
    content: ContentPart[],
    sessionId: string,
    userId: string,
    channelId?: string,
    threadHistoryContext?: string
  ): Promise<AgentApiResponse>
}

/**
 * エージェントAPIレスポンス
 */
export interface AgentApiResponse {
  response: {
    content: string
    toolCalls?: any[]
    metadata?: Record<string, any>
    error?: string
  }
  sessionId: string
}

/**
 * Slackメッセージフォーマッター
 */
export interface MessageFormatter {
  formatAgentResponse(response: AgentApiResponse): string
  formatErrorMessage(error: Error | string): string
  extractMentionText(text: string, botUserId: string): string
  splitLongMessage(message: string, maxLength?: number): string[]
  formatThreadHistory(messages: ThreadMessage[]): string
}
