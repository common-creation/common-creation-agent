/**
 * Common Creation Agent - Entry Point
 * 汎用AIエージェントシステムのメインエントリーポイント
 */

// Monkeypatchを最初に適用（すべてのインポートより前）
import './monkeypatch/zod-json-schema.js'

import { config } from 'dotenv'
import winston from 'winston'
import { AgentManagerImpl } from './agent/agent-manager.js'
import { ConfigManager } from './config/index.js'
import {
  SlackApp,
  SlackEventHandlerImpl,
  SlackMessageFormatter,
  VoltAgentApiClient,
} from './slack/index.js'

// 環境変数の読み込み
config()

// グローバル変数
let slackApp: SlackApp | undefined
let agentManager: AgentManagerImpl | undefined

// Logger設定
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
})

async function main() {
  console.log('🚀 Common Creation Agent starting...')

  try {
    // 設定を読み込み
    const configManager = new ConfigManager()
    const agentConfig = await configManager.loadConfig()
    const mcpServers = await configManager.loadMCPConfig()

    logger.info('✅ Configuration loaded', {
      provider: agentConfig.llm.provider,
      model: agentConfig.llm.model,
    })

    // AgentManagerを初期化
    const agentSettings = {
      id: 'main',
      name: 'Common Creation Agent',
      description: '',
      instructions: ``,
    }

    agentManager = new AgentManagerImpl(agentConfig, agentSettings, logger)
    await agentManager.initialize()

    logger.info('✨ Common Creation Agent initialized successfully!')
    logger.info(`🌐 Server running at http://localhost:${agentConfig.server?.port || 3141}`)
    logger.info('📝 Agent endpoint: /api/agent')

    // Slackゲートウェイの設定
    if (
      agentConfig.slack?.enabled &&
      agentConfig.slack.botToken &&
      agentConfig.slack.appToken &&
      agentConfig.slack.signingSecret
    ) {
      logger.info('📡 Initializing Slack integration...')

      try {
        // Slackアプリの初期化
        slackApp = new SlackApp(
          {
            botToken: agentConfig.slack.botToken,
            appToken: agentConfig.slack.appToken,
            signingSecret: agentConfig.slack.signingSecret,
            socketMode: true,
          },
          logger
        )

        // 各コンポーネントの初期化
        const voltAgentClient = new VoltAgentApiClient(
          'http://localhost:' + (agentConfig.server?.port || 3141),
          logger,
          120000
        )
        const messageFormatter = new SlackMessageFormatter()
        const eventHandler = new SlackEventHandlerImpl(
          voltAgentClient,
          messageFormatter,
          slackApp,
          logger
        )

        // イベントハンドラーの設定
        slackApp.setEventHandler(eventHandler)

        // Slackアプリの起動
        await slackApp.start()

        // Bot User IDをイベントハンドラーに設定
        const botUserId = slackApp.getBotUserId()
        if (botUserId) {
          eventHandler.setBotUserId(botUserId)
        }

        logger.info('✅ Slack integration started successfully')
      } catch (error) {
        logger.error('❌ Failed to start Slack integration:', error)
        // Slackの起動に失敗してもメインアプリは継続
      }
    } else if (agentConfig.slack?.enabled) {
      logger.warn('⚠️ Slack integration enabled but missing required credentials')
    }

    // MCPサーバーの設定（将来の実装用）
    if (mcpServers.length > 0) {
      logger.info(
        '🔧 MCP servers configured:',
        mcpServers.map((s) => s.name)
      )
    }
  } catch (error) {
    logger.error('❌ Failed to initialize agent:', error)
    process.exit(1)
  }
}

// エラーハンドリング
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// グレースフルシャットダウン
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...')

  // エージェントマネージャーの停止
  if (agentManager) {
    try {
      await agentManager.shutdown()
      logger.info('Agent manager shut down')
    } catch (error) {
      logger.error('Error shutting down agent manager:', error)
    }
  }

  // Slackアプリの停止
  if (slackApp) {
    try {
      await slackApp.stop()
      logger.info('Slack app stopped')
    } catch (error) {
      logger.error('Error stopping Slack app:', error)
    }
  }

  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...')

  // エージェントマネージャーの停止
  if (agentManager) {
    try {
      await agentManager.shutdown()
      logger.info('Agent manager shut down')
    } catch (error) {
      logger.error('Error shutting down agent manager:', error)
    }
  }

  // Slackアプリの停止
  if (slackApp) {
    try {
      await slackApp.stop()
      logger.info('Slack app stopped')
    } catch (error) {
      logger.error('Error stopping Slack app:', error)
    }
  }

  process.exit(0)
})

main().catch((error) => {
  logger.error('Failed to start Common Creation Agent:', error)
  process.exit(1)
})

export { main }
