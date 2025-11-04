/**
 * Message Formatter
 * Slack用メッセージフォーマッター
 */

import slackifyMarkdown from 'slackify-markdown'
import type { AgentApiResponse, MessageFormatter, ThreadMessage } from './types.js'


export class SlackMessageFormatter implements MessageFormatter {
  /**
   * エージェントのレスポンスをSlack用にフォーマット
   */
  formatAgentResponse(response: AgentApiResponse): string {
    const { content, toolCalls, error } = response.response

    if (error) {
      return this.formatErrorMessage(error)
    }

    let formattedMessage = slackifyMarkdown(content)

    // ツール呼び出しがある場合は追加情報として表示
    if (toolCalls && toolCalls.length > 0) {
      formattedMessage += '\n\n📋 *実行したツール* :'
      for (const toolCall of toolCalls) {
        formattedMessage += `\n• ${toolCall.toolName}`
        if (toolCall.error) {
          formattedMessage += ` ❌ (エラー: ${toolCall.error})`
        }
      }
    }

    return formattedMessage
  }

  /**
   * エラーメッセージをフォーマット
   */
  formatErrorMessage(error: Error | string): string {
    const errorMessage = error instanceof Error ? error.message : error

    // 特定のエラータイプに基づいてユーザーフレンドリーなメッセージを返す
    if (errorMessage.includes('timeout')) {
      return '⏱️ タイムアウトが発生しました。もう一度お試しください。'
    }

    if (errorMessage.includes('rate limit')) {
      return '🚦 一時的に利用制限に達しました。少し時間を置いてからお試しください。'
    }

    if (errorMessage.includes('VoltAgent API error')) {
      return '🔧 システムエラーが発生しました。しばらくしてからお試しください。'
    }

    return `❌ エラーが発生しました: ${errorMessage}`
  }

  /**
   * メンションテキストからボットメンションを削除
   */
  extractMentionText(text: string, botUserId: string): string {
    // <@USER_ID> 形式のメンションを削除
    const mentionPattern = new RegExp(`<@${botUserId}>\\s*`, 'g')
    return text.replace(mentionPattern, '').trim()
  }


  /**
   * 長いメッセージを分割
   */
  splitLongMessage(message: string, maxLength: number = 3000): string[] {
    if (message.length <= maxLength) {
      return [message]
    }

    const messages: string[] = []
    let currentMessage = ''
    const lines = message.split('\n')

    for (const line of lines) {
      if (currentMessage.length + line.length + 1 > maxLength) {
        if (currentMessage) {
          messages.push(currentMessage)
          currentMessage = line
        } else {
          // 単一行が長すぎる場合
          const chunks = this.chunkString(line, maxLength)
          messages.push(...chunks.slice(0, -1))
          currentMessage = chunks[chunks.length - 1]
        }
      } else {
        currentMessage += currentMessage ? '\n' + line : line
      }
    }

    if (currentMessage) {
      messages.push(currentMessage)
    }

    return messages
  }

  /**
   * 文字列を指定長で分割
   */
  private chunkString(str: string, size: number): string[] {
    const chunks: string[] = []
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size))
    }
    return chunks
  }

  /**
   * スレッド履歴を読みやすい形式にフォーマット
   */
  formatThreadHistory(messages: ThreadMessage[]): string {
    if (messages.length === 0) {
      return ''
    }

    const formattedMessages = messages.map((msg) => {
      // ユーザー表示名を決定
      const displayName = msg.userName || (msg.botId ? `Bot(${msg.botId})` : `<@${msg.user}>`)

      // タイムスタンプを時刻に変換（HH:MM形式）
      const timestamp = this.formatTimestamp(msg.ts)

      // テキストを整形（改行があれば適切にインデント）
      const text = msg.text.trim()

      return `${displayName} (${timestamp}): ${text}`
    }).join('\n')

    return `[スレッド履歴]\n${formattedMessages}\n---`
  }

  /**
   * Slackタイムスタンプを時刻文字列に変換（HH:MM形式）
   */
  private formatTimestamp(ts: string): string {
    try {
      const timestamp = parseFloat(ts) * 1000 // ミリ秒に変換
      const date = new Date(timestamp)
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    } catch {
      return ts.split('.')[0] // エラー時はタイムスタンプをそのまま返す
    }
  }
}
