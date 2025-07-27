/**
 * Event Handler
 * Slackイベントハンドラーの実装
 */

import type { Logger } from '../core/interfaces.js'
import type { ContentPart } from '../core/types.js'
import type {
  MessageFormatter,
  SlackEventHandler,
  SlackMessageContext,
  SlackService,
  VoltAgentClient,
  SlackFileShareEvent,
} from './types.js'

export class SlackEventHandlerImpl implements SlackEventHandler {
  private voltAgentClient: VoltAgentClient
  private messageFormatter: MessageFormatter
  private slackService: SlackService
  private logger?: Logger
  private botUserId?: string

  constructor(
    voltAgentClient: VoltAgentClient,
    messageFormatter: MessageFormatter,
    slackService: SlackService,
    logger?: Logger
  ) {
    this.voltAgentClient = voltAgentClient
    this.messageFormatter = messageFormatter
    this.slackService = slackService
    this.logger = logger
  }

  /**
   * Bot User IDを設定
   */
  setBotUserId(botUserId: string): void {
    this.botUserId = botUserId
  }

  /**
   * メンションイベントを処理
   */
  async handleMention(event: { text?: string; channel: string; thread_ts?: string; ts: string }, context: SlackMessageContext): Promise<void> {
    const { text, channel, thread_ts, ts } = event

    // メンションテキストからボットメンションを削除
    const safeText = text || ''
    const cleanedText = this.botUserId
      ? this.messageFormatter.extractMentionText(safeText, this.botUserId)
      : safeText

    if (!cleanedText) {
      await this.slackService.sendMessage(channel, 'なにか質問はありますか？', thread_ts || ts)
      return
    }

  // 会話ID: 衝突回避のため channel:thread_ts(or ts) 形式で一意化
  const conversationId = `${channel}:${thread_ts || ts}`

    this.logger?.info('Processing mention', {
      conversationId,
      userId: context.userId,
      channelId: context.channelId,
      message: cleanedText,
    })

    try {
      // タイピングインジケーターを表示（Slack APIでは直接サポートされていないため、リアクションで代替）
      await this.addReaction(channel, ts, 'thinking_face')

      // VoltAgent APIにメッセージを送信
      const response = await this.voltAgentClient.sendMessage(
        cleanedText,
        conversationId,
        context.userId,
        context.channelId
      )

      // リアクションを削除
      await this.removeReaction(channel, ts, 'thinking_face')

      // レスポンスをフォーマット
      const formattedMessage = this.messageFormatter.formatAgentResponse(response)

      // 長いメッセージの場合は分割
      const messages = this.messageFormatter.splitLongMessage(formattedMessage)

      // メッセージを送信
      for (const message of messages) {
        await this.slackService.sendMessage(channel, message, thread_ts || ts)
      }
    } catch (error) {
      // エラーリアクションを削除
      await this.removeReaction(channel, ts, 'thinking_face')

      this.logger?.error('Error processing mention', error)

      const errorMessage = this.messageFormatter.formatErrorMessage(
        error instanceof Error ? error : 'Unknown error'
      )

      await this.slackService.sendErrorMessage(channel, errorMessage, thread_ts || ts)
    }
  }

  /**
   * メッセージイベントを処理（DM）
   */
  async handleMessage(event: { text?: string; channel: string; thread_ts?: string; ts: string }, context: SlackMessageContext): Promise<void> {
    const { text, channel, thread_ts, ts } = event

    if (!text) {
      return
    }

  // 会話ID（DMでも衝突を避けるため channel:thread_ts(or ts) 形式）
  const conversationId = `${channel}:${thread_ts || ts}`

    this.logger?.info('Processing DM message', {
      conversationId,
      userId: context.userId,
      message: text,
    })

    try {
      // タイピングインジケーター
      await this.addReaction(channel, ts, 'thinking_face')

      // VoltAgent APIにメッセージを送信
      const response = await this.voltAgentClient.sendMessage(
        text,
        conversationId,
        context.userId,
        channel
      )

      // リアクションを削除
      await this.removeReaction(channel, ts, 'thinking_face')

      // レスポンスをフォーマット
      const formattedMessage = this.messageFormatter.formatAgentResponse(response)

      // 長いメッセージの場合は分割
      const messages = this.messageFormatter.splitLongMessage(formattedMessage)

      // メッセージを送信
      for (const message of messages) {
        await this.slackService.sendMessage(channel, message, thread_ts || ts)
      }
    } catch (error) {
      // エラーリアクションを削除
      await this.removeReaction(channel, ts, 'thinking_face')

      this.logger?.error('Error processing DM message', error)

      const errorMessage = this.messageFormatter.formatErrorMessage(
        error instanceof Error ? error : 'Unknown error'
      )

      await this.slackService.sendErrorMessage(channel, errorMessage, thread_ts || ts)
    }
  }

  /**
   * リアクションを追加（プライベートメソッド）
   */
  private async addReaction(channel: string, timestamp: string, reaction: string): Promise<void> {
    try {
      await this.slackService.addReaction(channel, timestamp, reaction)
    } catch (error) {
      this.logger?.warn('Failed to add reaction', error)
    }
  }

  /**
   * ファイル共有イベントを処理
   */
  async handleFileShare(event: SlackFileShareEvent, context: SlackMessageContext): Promise<void> {
    const { files, channel, thread_ts, ts, text } = event

    // 画像ファイルのみフィルタリング
    const imageFiles = files.filter(file => file.mimetype.startsWith('image/'))

    if (imageFiles.length === 0) {
      await this.slackService.sendMessage(
        channel,
        '画像ファイルが含まれていません。画像ファイルをアップロードしてください。',
        thread_ts || ts
      )
      return
    }

  // 会話ID: 画像共有イベントでも channel:thread_ts(or ts)
  const conversationId = `${channel}:${thread_ts || ts}`

    this.logger?.info('Processing file share', {
      conversationId,
      userId: context.userId,
      channelId: context.channelId,
      fileCount: imageFiles.length,
      text: text,
    })

    try {
      // タイピングインジケーター
      await this.addReaction(channel, ts, 'thinking_face')

      // 画像をダウンロードしてBase64エンコード
      const imageContents: ContentPart[] = []
      
      for (const file of imageFiles) {
        try {
          const base64Image = await this.slackService.downloadFileAsBase64(file)
          imageContents.push({
            type: 'image',
            image: base64Image,
            mimeType: file.mimetype,
          })
        } catch (error) {
          this.logger?.warn(`Failed to download image: ${file.name}`, error)
        }
      }

      if (imageContents.length === 0) {
        throw new Error('画像のダウンロードに失敗しました')
      }

      // テキストメッセージとコンバイン
      const content: ContentPart[] = []
      
      // テキストがある場合は追加
      if (text) {
        content.push({
          type: 'text',
          text: text,
        })
      } else {
        // テキストがない場合はデフォルトメッセージ
        content.push({
          type: 'text',
          text: 'この画像について教えてください。',
        })
      }

      // 画像を追加
      content.push(...imageContents)

      // VoltAgent APIにマルチモーダルメッセージを送信
      const response = await this.voltAgentClient.sendMultiModalMessage(
        content,
        conversationId,
        context.userId,
        context.channelId
      )

      // リアクションを削除
      await this.removeReaction(channel, ts, 'thinking_face')

      // レスポンスをフォーマット
      const formattedMessage = this.messageFormatter.formatAgentResponse(response)

      // 長いメッセージの場合は分割
      const messages = this.messageFormatter.splitLongMessage(formattedMessage)

      // メッセージを送信
      for (const message of messages) {
        await this.slackService.sendMessage(channel, message, thread_ts || ts)
      }
    } catch (error) {
      // エラーリアクションを削除
      await this.removeReaction(channel, ts, 'thinking_face')

      this.logger?.error('Error processing file share', error)

      const errorMessage = this.messageFormatter.formatErrorMessage(
        error instanceof Error ? error : 'Unknown error'
      )

      await this.slackService.sendErrorMessage(channel, errorMessage, thread_ts || ts)
    }
  }

  /**
   * リアクションを削除（プライベートメソッド）
   */
  private async removeReaction(
    channel: string,
    timestamp: string,
    reaction: string
  ): Promise<void> {
    try {
      await this.slackService.removeReaction(channel, timestamp, reaction)
    } catch (error) {
      this.logger?.warn('Failed to remove reaction', error)
    }
  }
}
