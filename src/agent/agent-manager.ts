/**
 * Agent Manager
 * エージェント管理の実装
 */

import { Agent, VoltAgent, Memory, type BaseMessage, type LanguageModel } from '@voltagent/core'

import { LibSQLMemoryAdapter } from '@voltagent/libsql'
import { honoServer } from '@voltagent/server-hono'
import { v4 as uuidv4 } from 'uuid'
import type { AgentCore, Logger } from '../core/interfaces.js'
import type { AgentConfig, AgentResponse, ConversationContext, Message, ContentPart, SubAgentConfig } from '../core/types.js'
import { LLMError, LLMErrorHandler, ModelFactoryImpl } from '../llm/index.js'
import { MCPManager } from '../mcp/index.js'
import { SessionManagerImpl } from './session-manager.js'
import type { AgentManager, AgentSettings, MessageProcessingOptions } from './types.js'

// 直接MCPManagerから取得したツールをAgentへ渡す（元の実装に戻す）

export class AgentManagerImpl implements AgentManager, AgentCore {
  private agent?: Agent
  private voltAgent?: VoltAgent
  private subAgents: Map<string, Agent> = new Map()
  private modelFactory: ModelFactoryImpl
  private sessionManager: SessionManagerImpl
  private mcpManager: MCPManager
  private config: AgentConfig
  private settings: AgentSettings
  private logger?: Logger
  private memory?: Memory
  private initialized = false

  /**
   * MCPライフサイクル設計方針:
   * - メインエージェント: mcpManagerインスタンスを起動中保持し、shutdown()で切断
   * - サブエージェント: mcpFile指定時に一時MCPManagerを生成・ツール取得後即切断
   * - この設計により、メインエージェントのツール共有とサブエージェントのツール分離を両立
   */

  constructor(config: AgentConfig, settings: AgentSettings, logger?: Logger) {
    this.config = config
    this.settings = settings
    this.logger = logger
    this.modelFactory = new ModelFactoryImpl(logger)
    this.sessionManager = new SessionManagerImpl(logger)
    this.mcpManager = new MCPManager()
  }

  /**
   * エージェントを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // 環境変数を設定
      this.modelFactory.setupEnvironment(this.config.llm)

      // モデルを取得
      const model = this.modelFactory.getModel(this.config.llm) as LanguageModel

      // Memoryを初期化
      this.memory = await this.initializeMemory()

      // MCP初期化とツール取得
      // MCPツール取得
      // MCPツール型は外部ライブラリ依存のため unknown[] として受け取りそのまま透過的に渡す
      let mcpTools: unknown[] = []
      try {
        await this.mcpManager.initializeServers()
        mcpTools = await this.mcpManager.getAvailableTools()
        const mcpToolNames = (mcpTools as Array<{ name?: string; description?: string }>).map((t) => ({ name: t.name, description: t.description }))
        this.logger?.info(`Loaded ${mcpTools.length} MCP tools:\n${JSON.stringify(mcpToolNames, null, 2)}`)
      } catch (error) {
        this.logger?.warn('Failed to initialize MCP, continuing without MCP tools', error)
      }

      // サブエージェントを作成（simpleはメインのツール共有、mcpFile指定時は個別ロード）
      await this.createSubAgents(model)

      // メインエージェントを作成
      const mainTools = mcpTools as Array<{
        name?: string
        description?: string
        // 任意のhandler署名（MCPツールが持っている可能性）
        handler?: (args: Record<string, unknown>) => Promise<unknown> | unknown
      }>
      this.agent = new Agent({
        id: this.settings.id,
        name: this.settings.name,
        instructions: this.buildInstructions(),
        model: model,
        memory: this.memory,
        tools: mainTools as unknown as [],
        markdown: true,
        maxSteps: 50, // ツールを最大50回まで実行可能
        subAgents: [...this.subAgents.values()],
      })

      this.logger?.debug(`System instructions: ${this.agent?.instructions}`)

      // VoltAgentインスタンスを作成
      const agents: Record<string, Agent> = {
        main: this.agent,
      }

      this.voltAgent = new VoltAgent({
        agents,
        server: honoServer({
          port: this.config.server?.port || 3141,
          enableSwaggerUI: true,
          configureApp: (app) => {
            // カスタムエンドポイントを設定
            app.post("/agents/main/text-custom", async (c) => {
              try {
                const body = await c.req.json() as unknown
                // body の構造を安全に抽出
                const { input, options = {} } = (typeof body === 'object' && body && 'input' in body)
                  ? (body as { input: string; options?: Record<string, unknown> })
                  : { input: '', options: {} }

                // 入力の型情報をログ（デバッグ用）
                this.logger?.debug('Custom endpoint received input', {
                  inputType: typeof input,
                  hasRole: typeof input === 'object' && input !== null && 'role' in (input as Record<string, unknown>),
                  hasContent: typeof input === 'object' && input !== null && 'content' in (input as Record<string, unknown>),
                })

                // マルチモーダル等の複合構造が来た場合に text のみ抽出して generateText に渡す（voltagent の generateText が複合型未対応である可能性に対応）
                let normalizedInput: unknown = input
                if (typeof input === 'object' && input !== null && 'content' in (input as Record<string, unknown>)) {
                  try {
                    const contentArr = (input as { content?: unknown }).content
                    if (Array.isArray(contentArr)) {
                      const textParts = contentArr
                        .filter(p => p && typeof p === 'object' && (p as { type?: string }).type === 'text')
                        .map(p => (p as { text?: string }).text)
                        .filter((t): t is string => typeof t === 'string')
                      if (textParts.length > 0) {
                        normalizedInput = textParts.join('\n')
                      }
                    }
                  } catch (e) {
                    this.logger?.warn('Failed to normalize structured input for generateText', e)
                  }
                }

                // normalizedInput がオブジェクトのままなら安全のため string 化（schema 生成でカスタム型エラー回避）
                if (typeof normalizedInput === 'object' && normalizedInput !== null) {
                  try {
                    normalizedInput = JSON.stringify(normalizedInput)
                  } catch (e) {
                    this.logger?.warn('Failed to stringify non-text input; falling back to empty string', e)
                    normalizedInput = ''
                  }
                }

                // エージェントのgenerateTextを直接呼び出す
                const generateOptions: Record<string, unknown> = { temperature: 1 }
                // reasoning設定がある場合のみ追加
                if (this.config.llm.reasoning?.effort) {
                  generateOptions.reasoning = {
                    effort: this.config.llm.reasoning.effort
                  }
                }
                const userIdOpt = typeof (options as Record<string, unknown>).userId === 'string'
                  ? (options as { userId: string }).userId
                  : undefined
                const convIdOpt = typeof (options as Record<string, unknown>).conversationId === 'string'
                  ? (options as { conversationId: string }).conversationId
                  : undefined

                const result = await this.agent!.generateText(normalizedInput as string, {
                  userId: userIdOpt,
                  conversationId: convIdOpt,
                  ...generateOptions,
                })

                // VoltAgent APIと同じ形式でレスポンスを返す
                return c.json({
                  success: true,
                  data: {
                    text: result.text,
                    usage: result.usage,
                    toolCalls: result.toolCalls,
                    toolResults: result.toolResults,
                    finishReason: result.finishReason,
                  },
                })
              } catch (error) {
                // 追加詳細ログ（問題の型を特定しやすくする）
                if (error instanceof Error) {
                  // JSON Schemaエラーの特別な処理
                  if (error.message.includes('Custom types cannot be represented in JSON Schema')) {
                    this.logger?.error('JSON Schema conversion error detected. This is likely caused by incompatible tool schemas from MCP servers.', {
                      name: error.name,
                      message: error.message,
                      suggestion: 'Check MCP tool schemas for custom Zod types or incompatible schema definitions',
                      stack: error.stack,
                    })
                    return c.json({
                      success: false,
                      error: 'システムエラーが発生しました。一部のツールスキーマに互換性の問題があります。管理者にお問い合わせください。',
                    }, 500)
                  }

                  this.logger?.error('Custom endpoint error:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                  })
                } else {
                  this.logger?.error('Custom endpoint non-Error thrown', {
                    valueType: typeof error,
                    value: error,
                  })
                }
                return c.json({
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error',
                }, 500)
              }
            })
          },
        }),
      })

      this.initialized = true
      this.logger?.info(`Agent initialized: ${this.settings.name}`)

      // セッションクリーンアップを定期実行（30分ごと）
      setInterval(
        () => {
          this.sessionManager.cleanupInactiveSessions(60 * 24 * 3) // 60分以上非アクティブ
        },
        30 * 60 * 1000
      )
    } catch (error) {
      this.logger?.error('Failed to initialize agent', error)
      throw error
    }
  }

  /**
   * Memoryを初期化
   */
  private async initializeMemory(): Promise<Memory> {
    const memoryConfig = this.config.memory

    // メモリが無効な場合はインメモリを使用
    if (!memoryConfig?.enabled) {
      this.logger?.info('Using in-memory storage (disabled in config)')
      return new Memory({ storage: new LibSQLMemoryAdapter({ url: 'file:./data/memory.db' }) })
    }

    try {
      const memoryPath = memoryConfig.path || 'file:./data/memory.db'
      this.logger?.info(`Initializing persistent memory: ${memoryPath}`)

      // ストレージアダプターを作成
      const storage = new LibSQLMemoryAdapter({ url: memoryPath })

      // シンプルな永続メモリのみ使用（embedding/vector/workingMemory 無効）
      return new Memory({ storage })
    } catch (error) {
      this.logger?.error('Failed to initialize persistent memory, falling back to in-memory', error)
      return new Memory({ storage: new LibSQLMemoryAdapter({ url: 'file:./data/memory.db' }) })
    }
  }

  /**
   * エージェントコアインターフェースの実装
   */
  async initializeAgent(config: AgentConfig): Promise<void> {
    this.config = config
    await this.initialize()
  }

  /**
   * エージェントを取得
   */
  getAgent(): Agent {
    if (!this.agent) {
      throw new Error('Agent not initialized')
    }
    return this.agent
  }

  /**
   * メッセージを処理
   */
  async processMessage(
    message: string | ContentPart[],
    context: ConversationContext,
    options?: MessageProcessingOptions
  ): Promise<AgentResponse> {
    // messageContent は不要（generateResponse 内で処理）
    this.logger?.debug(`Processing message: ${typeof message === 'string' ? message : 'multimodal content'}`)
    this.logger?.debug(`Context: ${JSON.stringify(context)}`)
    this.logger?.debug(`Options: ${JSON.stringify(options)}`)

    if (!this.agent) {
      throw new Error('Agent not initialized')
    }

    // セッションの取得または作成
    let session = this.sessionManager.getSession(context.sessionId)
    if (!session) {
      session = this.sessionManager.createSession(context.userId, context.channelId)
      context = session.context
    }

    try {
      // ユーザーメッセージを履歴に追加
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: message,
        timestamp: new Date(),
      }
      this.sessionManager.addMessageToHistory(context.sessionId, userMessage)

      // LLMに問い合わせ
      const response = await this.generateResponse(message, context, options)

      // アシスタントの応答を履歴に追加
      const assistantMessage: Message = {
        id: uuidv4(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: response.metadata,
      }
      this.sessionManager.addMessageToHistory(context.sessionId, assistantMessage)

      return response
    } catch (error) {
      this.logger?.error('Error processing message', error)

      // エラーハンドリング
      if (error instanceof LLMError) {
        const userMessage = LLMErrorHandler.getUserFriendlyMessage(error)
        return {
          content: userMessage,
          error: error.message,
        }
      }

      return {
        content: '申し訳ございません。処理中にエラーが発生しました。',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * メッセージ配列を準備
   */
  // prepareMessages: 利用箇所が無いため削除

  /**
   * マルチモーダルメッセージをフォーマット
   */
  // formatMultiModalMessage: 未使用

  /**
   * レスポンスを生成
   */
  private async generateResponse(
    message: string | ContentPart[],
    context: ConversationContext,
    options?: MessageProcessingOptions
  ): Promise<AgentResponse> {
    this.logger?.debug(`Generating response for message: ${typeof message === 'string' ? message : 'multimodal content'}`)
    try {
      // マルチモーダルコンテンツの場合、VoltAgentのformatに変換
      let voltAgentMessage: string | BaseMessage[]

      if (typeof message === 'string') {
        voltAgentMessage = message
      } else {
        // ContentPart[]をBaseMessage形式に変換
        voltAgentMessage = [{
          role: 'user' as const,
          // ContentPart[] をそのまま渡す（型は BaseMessage の content に適合可能な構造）
          content: message as ContentPart[]
        }]
      }

      if (options?.streamMode) {
        // ストリーミングモード
        const streamOptions: Record<string, unknown> = {
          temperature: 1, // 固定値
        }
        // reasoning設定がある場合のみ追加
        if (this.config.llm.reasoning?.effort) {
          streamOptions.reasoning = {
            effort: this.config.llm.reasoning.effort
          }
        }
        const stream = await this.agent!.streamText(voltAgentMessage, {
          userId: context.userId,
          conversationId: context.sessionId,
          ...streamOptions,
        })

        // ストリーミングレスポンスを文字列に変換
        let fullContent = ''
        for await (const chunk of stream.textStream) {
          fullContent += chunk
        }

        return {
          content: fullContent,
          metadata: {
            streamMode: true,
          },
        }
      } else {
        // 通常モード
        const generateOptions: Record<string, unknown> = {
          temperature: 1, // 固定値
        }
        // reasoning設定がある場合のみ追加
        if (this.config.llm.reasoning?.effort) {
          generateOptions.reasoning = {
            effort: this.config.llm.reasoning.effort
          }
        }
        const result = await this.agent!.generateText(voltAgentMessage, {
          userId: context.userId,
          conversationId: context.sessionId,
          ...generateOptions,
        })

        // VoltAgentが自動的にツールを実行してくれるので、結果をそのまま返す
        return {
          content: result.text,
          toolCalls: result.toolCalls?.map(call => {
            type ToolCallShape = { toolName: string; args?: Record<string, unknown>; parameters?: Record<string, unknown> }
            const c = call as ToolCallShape
            return {
              toolName: c.toolName,
              parameters: c.args || c.parameters || {},
            }
          }),
          // toolResultsも含める（VoltAgentが実行済みの結果）
          metadata: result.toolResults ? { toolResults: result.toolResults } : undefined,
        }
      }
    } catch (error) {
      // モデルファクトリエラーハンドリング
      await this.modelFactory.handleError(error, this.config.llm.provider)
      throw error // 再スロー
    }
  }

  /**
   * サブエージェントを作成
   *
   * サブエージェントごとに専用のMCPサーバー設定ファイル(mcpFile)を指定できます。
   * mcpFileが未指定の場合はツールなしで初期化されます（mcpFile指定時のみ個別MCP読み込み）。
   */

  // mainModel: 言語モデルインスタンス。voltagent側の型が不明確なため一旦unknown受け → Agent生成時にキャスト。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createSubAgents(mainModel: LanguageModel): Promise<void> {
    if (!this.config.subAgents || this.config.subAgents.length === 0) {
      return
    }

    for (const subAgentConfig of this.config.subAgents) {
      try {
        // LLM設定のオーバーライドがある場合は専用モデルを使用
        // mainModelは外部Factoryの戻り値型（不明）なのでそのままunknown → Agent生成時に型拘束が緩い前提
        let subAgentModel: LanguageModel = mainModel
        if (subAgentConfig.llm && Object.keys(subAgentConfig.llm).length > 0) {
          // メインLLM設定をベースにサブエージェントのLLM設定でマージ
          const mergedConfig = {
            provider: subAgentConfig.llm.provider || this.config.llm.provider,
            model: subAgentConfig.llm.model || this.config.llm.model,
            apiKey: subAgentConfig.llm.apiKey || this.config.llm.apiKey,
            baseUrl: subAgentConfig.llm.baseUrl || this.config.llm.baseUrl,
            region: subAgentConfig.llm.region || this.config.llm.region,
            accessKeyId: subAgentConfig.llm.accessKeyId || this.config.llm.accessKeyId,
            secretAccessKey: subAgentConfig.llm.secretAccessKey || this.config.llm.secretAccessKey,
            reasoning: subAgentConfig.llm.reasoning || this.config.llm.reasoning,
          }

          // 環境変数を設定
          this.modelFactory.setupEnvironment(mergedConfig)

          subAgentModel = this.modelFactory.getModel(mergedConfig) as LanguageModel

          const overrides = []
          if (subAgentConfig.llm.provider) overrides.push(`provider: ${subAgentConfig.llm.provider}`)
          if (subAgentConfig.llm.model) overrides.push(`model: ${subAgentConfig.llm.model}`)
          if (subAgentConfig.llm.apiKey) overrides.push('apiKey: ***')
          if (subAgentConfig.llm.baseUrl) overrides.push(`baseUrl: ${subAgentConfig.llm.baseUrl}`)
          if (subAgentConfig.llm.region) overrides.push(`region: ${subAgentConfig.llm.region}`)

          this.logger?.info(`Sub-agent '${subAgentConfig.id}' using LLM overrides: ${overrides.join(', ')}`)
        }

        // サブエージェント専用MCPツールをロード（mcpFile指定時のみ）
        const subAgentTools = subAgentConfig.mcpFile
          ? await this.loadSubAgentMcpTools(subAgentConfig.mcpFile, subAgentConfig.id)
          : []

        // サブエージェント用の命令を構築
        const instructions = this.buildSubAgentInstructions(subAgentConfig)

        // サブエージェントを作成
        const saTools = subAgentTools as Array<{
          name?: string
          description?: string
          handler?: (args: Record<string, unknown>) => Promise<unknown> | unknown
        }>
        const subAgent = new Agent({
          id: subAgentConfig.id,
          name: subAgentConfig.name,
          instructions,
          // 外部ライブラリ型詳細不明のため、そのまま渡す（上位で生成済み）
          model: subAgentModel,
          memory: this.memory, // メモリは共有
          tools: saTools as unknown as [],
          markdown: true,
          maxSteps: 50,
        })

        this.subAgents.set(subAgentConfig.id, subAgent)
        this.logger?.info(`Sub-agent created: ${subAgentConfig.id} (${subAgentConfig.name}) with ${subAgentTools.length} MCP tools`)
      } catch (error) {
        this.logger?.error(`Failed to create sub-agent '${subAgentConfig.id}':`, error)
        throw error
      }
    }
  }

  /**
   * サブエージェント専用MCPツールをロード
   *
   * 設計方針:
   * - サブエージェントごとに独立したMCPManagerインスタンスを利用
   * - 初期化時に一度だけ読み込み、再利用や再接続は行わない（シンプルなライフサイクル）
   * - 読み込み失敗時は警告ログを出力し、空ツールで継続（エージェント起動を妨げない）
   */
  private async loadSubAgentMcpTools(mcpFile: string, subAgentId: string): Promise<unknown[]> {
    try {
      this.logger?.info(`Loading MCP configuration for sub-agent '${subAgentId}' from: ${mcpFile}`)

      // セキュリティ: config/ ディレクトリ外のパスは拒否
      // Docker環境では ./config/ と config/ の両方を許可（コンテナ内での実行ディレクトリに依存）
      if (!mcpFile.startsWith('config/') && !mcpFile.startsWith('./config/')) {
        this.logger?.warn(`Sub-agent '${subAgentId}' mcpFile '${mcpFile}' is outside config/ directory. Skipping for security.`)
        return []
      }

      // MCP設定ファイルを読み込み
      const fs = await import('fs/promises')
      const path = await import('path')

      // Docker環境とローカル環境の両方で動作するようにパスを解決
      // mcpFileは実行ディレクトリからの相対パスとして扱う
      const fullPath = path.resolve(mcpFile)
      try {
        await fs.access(fullPath)
      } catch {
        this.logger?.warn(`MCP configuration file not found for sub-agent '${subAgentId}': ${fullPath}`)
        return []
      }

      const mcpConfigContent = await fs.readFile(fullPath, 'utf-8')
      const mcpConfig = JSON.parse(mcpConfigContent)

      // 個別MCPManagerを初期化
      const subAgentMcpManager = new MCPManager()
      await subAgentMcpManager.initializeServers(mcpConfig)

      const tools = await subAgentMcpManager.getAvailableTools()
      this.logger?.info(`Loaded ${tools.length} MCP tools for sub-agent '${subAgentId}'`)

      // ツール名をログ出力
      if (tools.length > 0) {
        const toolNames = tools.map((t) => ({ name: t.name, description: t.description }))
        this.logger?.debug(`Sub-agent '${subAgentId}' MCP tools:\n${JSON.stringify(toolNames, null, 2)}`)
      }

      // 即時切断（サブエージェントMCPは使い捨て）
      await subAgentMcpManager.disconnect().catch((error) => {
        this.logger?.warn(`Failed to disconnect MCP manager for sub-agent '${subAgentId}':`, error)
      })

      return tools
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger?.warn(`Failed to load MCP configuration for sub-agent '${subAgentId}': ${message}. Continuing without MCP tools.`)
      return []
    }
  }

  /**
   * サブエージェント用の命令を構築
   */
  private buildSubAgentInstructions(subAgentConfig: SubAgentConfig): string {
    const parts: string[] = []

    // システムプロンプトを最初に追加
    parts.push(subAgentConfig.systemPrompt)

    // 説明がある場合は追加
    if (subAgentConfig.description) {
      parts.push(subAgentConfig.description)
    }

    // 命令を追加
    parts.push(subAgentConfig.instructions)

    return parts.join('\n\n')
  }

  /**
   * 命令を構築
   */
  private buildInstructions(): string {
    const parts: string[] = []

    // 設定ファイルからのシステムプロンプトを最初に追加
    if (this.config.agent?.systemPrompt) {
      parts.push(this.config.agent.systemPrompt)
    }

    // エージェント設定の説明
    if (this.settings.description) {
      parts.push(this.settings.description)
    }

    // エージェント設定の命令
    if (this.settings.instructions) {
      parts.push(this.settings.instructions)
    }

    return parts.join('\n\n')
  }

  /**
   * シャットダウン
   */
  async shutdown(): Promise<void> {
    // VoltAgentの停止処理はSIGINT/SIGTERMで自動的に行われるため、
    // ここではログのみ出力
    if (this.voltAgent) {
      this.logger?.info('VoltAgent will be stopped by SIGINT/SIGTERM handler')
    }

    // セッションのクリーンアップ
    const sessions = this.sessionManager.getActiveSessions()
    sessions.forEach((session) => {
      this.sessionManager.removeSession(session.id)
    })

    // MCP切断
    try {
      await this.mcpManager.disconnect()
    } catch (error) {
      this.logger?.error('Error disconnecting MCP', error)
    }

    this.initialized = false
    this.logger?.info('Agent shut down')
  }

  /**
   * セッション統計を取得
   */
  getSessionStats() {
    return this.sessionManager.getSessionStats()
  }
}
