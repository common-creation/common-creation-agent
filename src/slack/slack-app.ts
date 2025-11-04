/**
 * Slack App
 * Slack Boltアプリケーションの実装
 */

import bolt from '@slack/bolt'
import axios from 'axios'

const { App, LogLevel } = bolt

import type { Logger } from '../core/interfaces.js'
import type { SlackConfig, SlackEventHandler, SlackMessageContext, SlackService, SlackFile, SlackFileShareEvent, ThreadMessage } from './types.js'

export class SlackApp implements SlackService {
  private app: any // Slack Bolt Appインスタンス
  private logger?: Logger
  private config: SlackConfig
  private eventHandler?: SlackEventHandler
  private botUserId?: string

  constructor(config: SlackConfig, logger?: Logger) {
    this.config = config
    this.logger = logger

    // Slack Boltアプリを初期化
    this.app = new App({
      token: config.botToken,
      signingSecret: config.signingSecret,
      socketMode: config.socketMode !== false, // デフォルトはtrue
      appToken: config.socketMode !== false ? config.appToken : undefined,
      logLevel: this.logger ? LogLevel.DEBUG : LogLevel.INFO,
    })

    this.setupEventListeners()
  }

  /**
   * イベントハンドラーを設定
   */
  setEventHandler(handler: SlackEventHandler): void {
    this.eventHandler = handler
  }

  /**
   * Slackアプリを起動
   */
  async start(): Promise<void> {
    try {
      await this.app.start()

      // Bot User IDを取得
      const authResult = await this.app.client.auth.test({
        token: this.config.botToken,
      })
      this.botUserId = authResult.user_id

      this.logger?.info('⚡️ Slack app is running!')
      this.logger?.info(`Bot User ID: ${this.botUserId}`)
    } catch (error) {
      this.logger?.error('Failed to start Slack app', error)
      throw error
    }
  }

  /**
   * Slackアプリを停止
   */
  async stop(): Promise<void> {
    try {
      await this.app.stop()
      this.logger?.info('Slack app stopped')
    } catch (error) {
      this.logger?.error('Failed to stop Slack app', error)
      throw error
    }
  }

  /**
   * メッセージを送信
   */
  async sendMessage(channelId: string, message: string, threadTs?: string): Promise<void> {
    try {
      await this.app.client.chat.postMessage({
        token: this.config.botToken,
        channel: channelId,
        text: message,
        thread_ts: threadTs,
      })
    } catch (error) {
      this.logger?.error('Failed to send message', error)
      throw error
    }
  }

  /**
   * エラーメッセージを送信
   */
  async sendErrorMessage(channelId: string, error: string, threadTs?: string): Promise<void> {
    const errorMessage = `❌ エラーが発生しました: ${error}`
    await this.sendMessage(channelId, errorMessage, threadTs)
  }

  /**
   * イベントリスナーを設定
   */
  private setupEventListeners(): void {
    // アプリメンションイベント
    this.app.event('app_mention', async ({ event, say }: any) => {
      if (!this.eventHandler) {
        this.logger?.warn('No event handler set for app_mention')
        return
      }

      const context: SlackMessageContext = {
        userId: event.user || 'unknown',
        channelId: event.channel,
        threadTs: event.thread_ts,
        ts: event.ts,
      }

      try {
        await this.eventHandler.handleMention(event, context)
      } catch (error) {
        this.logger?.error('Error handling app_mention', error)
        await this.sendErrorMessage(
          event.channel,
          error instanceof Error ? error.message : 'Unknown error',
          event.thread_ts || event.ts
        )
      }
    })

    // メッセージイベント（DMやプライベートチャンネル）
    this.app.event('message', async ({ event, say }: any) => {
      // ファイル共有イベントの場合
      if ('subtype' in event && event.subtype === 'file_share' && 'files' in event && event.files) {
        if (!this.eventHandler) {
          this.logger?.warn('No event handler set for file_share')
          return
        }

        const context: SlackMessageContext = {
          userId: 'user' in event && event.user ? event.user : 'unknown',
          channelId: event.channel,
          threadTs: 'thread_ts' in event ? event.thread_ts : undefined,
          ts: event.ts,
        }

        try {
          const fileShareEvent: SlackFileShareEvent = event as any
          await this.eventHandler.handleFileShare(fileShareEvent, context)
        } catch (error) {
          this.logger?.error('Error handling file_share', error)
          await this.sendErrorMessage(
            event.channel,
            error instanceof Error ? error.message : 'Unknown error',
            'thread_ts' in event ? event.thread_ts || event.ts : event.ts
          )
        }
        return
      }

      // サブタイプがある場合はスキップ（編集、削除など）
      if ('subtype' in event && event.subtype) {
        return
      }

      // ボット自身のメッセージはスキップ
      if ('user' in event && event.user === this.botUserId) {
        return
      }

      if (!this.eventHandler) {
        this.logger?.warn('No event handler set for message')
        return
      }

      const context: SlackMessageContext = {
        userId: 'user' in event && event.user ? event.user : 'unknown',
        channelId: event.channel,
        threadTs: 'thread_ts' in event ? event.thread_ts : undefined,
        ts: event.ts,
      }

      try {
        // DMかどうかを確認
        const channelInfo = await this.app.client.conversations.info({
          token: this.config.botToken,
          channel: event.channel,
        })

        // DMの場合のみ処理（プライベートチャンネルとマルチユーザーDMは除外）
        if (channelInfo.channel?.is_im) {
          await this.eventHandler.handleMessage(event, context)
        }
      } catch (error) {
        this.logger?.error('Error handling message', error)
        await this.sendErrorMessage(
          event.channel,
          error instanceof Error ? error.message : 'Unknown error',
          'thread_ts' in event ? event.thread_ts || event.ts : event.ts
        )
      }
    })

    // エラーハンドリング
    this.app.error(async (error: any) => {
      this.logger?.error('Slack app error', error)
    })
  }

  /**
   * Bot User IDを取得
   */
  getBotUserId(): string | undefined {
    return this.botUserId
  }

  /**
   * リアクションを追加
   */
  async addReaction(channelId: string, timestamp: string, reaction: string): Promise<void> {
    try {
      await this.app.client.reactions.add({
        token: this.config.botToken,
        channel: channelId,
        timestamp: timestamp,
        name: reaction,
      })
    } catch (error: any) {
      // already_reactedエラーは無視
      if (error?.data?.error !== 'already_reacted') {
        this.logger?.warn('Failed to add reaction', error)
      }
    }
  }

  /**
   * リアクションを削除
   */
  async removeReaction(channelId: string, timestamp: string, reaction: string): Promise<void> {
    try {
      await this.app.client.reactions.remove({
        token: this.config.botToken,
        channel: channelId,
        timestamp: timestamp,
        name: reaction,
      })
    } catch (error: any) {
      // no_reactionエラーは無視
      if (error?.data?.error !== 'no_reaction') {
        this.logger?.warn('Failed to remove reaction', error)
      }
    }
  }

  /**
   * ファイルをダウンロードしてBase64エンコード
   */
  async downloadFileAsBase64(file: SlackFile): Promise<string> {
    try {
      // 画像ファイルかどうかチェック
      if (!file.mimetype.startsWith('image/')) {
        throw new Error(`Unsupported file type: ${file.mimetype}`)
      }

      // ファイルサイズチェック（20MB制限）
      const maxSize = 20 * 1024 * 1024 // 20MB
      if (file.size > maxSize) {
        throw new Error(`File size exceeds limit: ${file.size} bytes (max: ${maxSize} bytes)`)
      }

      // ファイルをダウンロード
      const response = await axios({
        method: 'GET',
        url: file.url_private,
        headers: {
          'Authorization': `Bearer ${this.config.botToken}`,
        },
        responseType: 'arraybuffer',
      })

      // Base64エンコード
      const base64 = Buffer.from(response.data).toString('base64')

      // Data URIフォーマットで返す
      return `data:${file.mimetype};base64,${base64}`
    } catch (error) {
      this.logger?.error('Failed to download file', error)
      throw error
    }
  }

  /**
   * スレッド内のメッセージ履歴を取得
   * 環境変数 SLACK_LOOKUP_THREAD_HISTORY=1 の場合のみ有効
   */
  async getThreadReplies(channelId: string, threadTs: string, limit: number = 50): Promise<ThreadMessage[]> {
    try {
      const result = await this.app.client.conversations.replies({
        token: this.config.botToken,
        channel: channelId,
        ts: threadTs,
        limit,
        inclusive: true, // スレッドの最初のメッセージも含める
      })

      if (!result.messages || result.messages.length === 0) {
        return []
      }

      // ThreadMessage形式に変換
      const threadMessages: ThreadMessage[] = result.messages.map((msg: any) => ({
        user: msg.user || msg.bot_id || 'unknown',
        text: msg.text || '',
        ts: msg.ts,
        botId: msg.bot_id,
        userName: undefined, // 必要に応じて後でユーザー情報を取得
      }))

      this.logger?.debug(`Retrieved ${threadMessages.length} messages from thread ${threadTs}`)
      return threadMessages
    } catch (error) {
      this.logger?.error('Failed to get thread replies', error)
      // エラー時は空配列を返す（フォールバック）
      return []
    }
  }

  /**
   * チャンネルかどうかを判定（DM/MPDMを除外）
   */
  async isChannel(channelId: string): Promise<boolean> {
    try {
      const channelInfo = await this.app.client.conversations.info({
        token: this.config.botToken,
        channel: channelId,
      })

      // DM（is_im=true）またはMPDM（is_mpim=true）の場合はfalse
      if (channelInfo.channel?.is_im || channelInfo.channel?.is_mpim) {
        return false
      }

      // それ以外（パブリックチャンネル、プライベートチャンネル）はtrue
      return true
    } catch (error) {
      this.logger?.warn('Failed to check channel type', error)
      // エラー時はfalseを返す（安全側に倒す）
      return false
    }
  }
}
