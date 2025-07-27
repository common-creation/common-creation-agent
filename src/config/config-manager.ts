/**
 * Configuration Manager Implementation
 * 設定管理の実装
 */

import { constants } from 'fs'
import { access, readFile } from 'fs/promises'
import { parse } from 'yaml'
import type { ConfigManager, Logger } from '../core/interfaces.js'
import type { AgentConfig, MCPConfig, MCPServerConfig, SubAgentConfig, SubAgentLLMConfig } from '../core/types.js'

// デフォルト設定値
const DEFAULT_CONFIG: Partial<AgentConfig> = {
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
  },
  logging: {
    level: 'info',
    format: 'json',
  },
}

// ログレベルの型定義
type LogLevel = 'error' | 'warn' | 'info' | 'debug'

// 設定エラークラス
class ConfigError extends Error {
  constructor(
    message: string,
    public readonly details?: any
  ) {
    super(message)
    this.name = 'ConfigError'
  }
}

export class ConfigManagerImpl implements ConfigManager {
  private configPath: string
  private mcpConfigPath: string
  private configCache?: AgentConfig
  private mcpConfigCache?: MCPServerConfig[]
  private logger?: Logger

  constructor(
    configPath = './config/agent.yml',
    mcpConfigPath = './config/mcp.json',
    logger?: Logger
  ) {
    this.configPath = configPath
    this.mcpConfigPath = mcpConfigPath
    this.logger = logger
  }

  /**
   * ファイルの存在を確認
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  /**
   * エージェント設定を読み込む
   */
  async loadConfig(): Promise<AgentConfig> {
    // キャッシュがあればそれを返す
    if (this.configCache) {
      return this.configCache
    }

    try {
      let fileConfig: any = {}

      // 設定ファイルが存在する場合のみ読み込む
      if (await this.fileExists(this.configPath)) {
        const configFile = await readFile(this.configPath, 'utf-8')
        fileConfig = parse(configFile)
      } else {
        console.warn(
          `Configuration file not found: ${this.configPath}. Using defaults and environment variables.`
        )
      }

      // デフォルト値とファイル設定をマージ
      const mergedConfig = this.deepMerge(DEFAULT_CONFIG, fileConfig)

      // 設定ファイルから読み込み
      const agentConfig: AgentConfig = {
        server: {
          port: mergedConfig.server?.port || 3141,
        },
        agent: this.parseAgentConfig(mergedConfig.agent),
        subAgents: this.parseSubAgentsConfig(mergedConfig.subAgents),
        llm: {
          provider: this.getProvider(mergedConfig.llm?.provider),
          model: mergedConfig.llm?.model || DEFAULT_CONFIG.llm!.model!,
          apiKey: this.extractApiKey(mergedConfig.llm),
          baseUrl: this.extractBaseUrl(mergedConfig.llm),
          region: this.extractRegion(mergedConfig.llm),
          accessKeyId: mergedConfig.llm?.bedrock?.accessKeyId,
          secretAccessKey: mergedConfig.llm?.bedrock?.secretAccessKey,
          // reasoning設定が存在する場合のみ追加
          ...(mergedConfig.llm?.reasoning && {
            reasoning: {
              effort: mergedConfig.llm.reasoning.effort,
            },
          }),
        },
        memory: this.parseMemoryConfig(mergedConfig.memory),
        slack: this.parseSlackConfig(mergedConfig.slack),
        logging: {
          level: this.getLogLevel(mergedConfig.logging?.level),
          format: mergedConfig.logging?.format || DEFAULT_CONFIG.logging!.format!,
        },
      }

      // 設定の検証
      this.validateConfigWithDetails(agentConfig)

      // キャッシュに保存
      this.configCache = agentConfig
      return agentConfig
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error
      }
      throw new ConfigError(`Failed to load configuration: ${error}`, { path: this.configPath })
    }
  }

  /**
   * プロバイダーの取得と検証
   */
  private getProvider(value?: string): 'openai' | 'bedrock' {
    const provider = value || 'openai'
    if (provider !== 'openai' && provider !== 'bedrock') {
      throw new ConfigError(`Invalid LLM provider: ${provider}. Must be 'openai' or 'bedrock'.`)
    }
    return provider
  }

  /**
   * APIキーの抽出
   */
  private extractApiKey(llmConfig: any): string | undefined {
    return llmConfig?.openai?.apiKey
  }

  /**
   * Base URLの抽出
   */
  private extractBaseUrl(llmConfig: any): string | undefined {
    const baseUrl = llmConfig?.openai?.baseUrl
    if (!baseUrl) {
      return undefined
    }
    
    // URL形式の検証と正規化
    if (typeof baseUrl !== 'string') {
      throw new ConfigError('baseUrl must be a string')
    }
    
    // 空文字列の場合は未設定とみなす
    if (baseUrl.trim() === '') {
      return undefined
    }
    
    // URL形式の検証（http/httpsで始まること）
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      throw new ConfigError('baseUrl must start with http:// or https://')
    }
    
    // 末尾のスラッシュを除去
    return baseUrl.replace(/\/+$/, '')
  }

  /**
   * リージョンの抽出
   */
  private extractRegion(llmConfig: any): string | undefined {
    return llmConfig?.bedrock?.region
  }

  /**
   * ログレベルの取得と検証
   */
  private getLogLevel(value?: string): string {
    const level = value || DEFAULT_CONFIG.logging!.level!
    const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug']
    if (!validLevels.includes(level as LogLevel)) {
      console.warn(`Invalid log level: ${level}. Using 'info'.`)
      return 'info'
    }
    return level
  }

  /**
   * 整数パース（デフォルト値付き）
   */
  private parseIntWithDefault(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue
    const parsed = parseInt(value, 10)
    return isNaN(parsed) ? defaultValue : parsed
  }

  /**
   * 浮動小数点数パース（デフォルト値付き）
   */
  private parseFloatWithDefault(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue
    const parsed = parseFloat(value)
    return isNaN(parsed) ? defaultValue : parsed
  }

  /**
   * エージェント設定のパース
   */
  private parseAgentConfig(agentConfig?: any): AgentConfig['agent'] {
    if (!agentConfig) {
      return undefined
    }

    return {
      name: agentConfig.name,
      description: agentConfig.description,
      systemPrompt: agentConfig.systemPrompt,
    }
  }

  /**
   * Memory設定のパース
   */
  private parseMemoryConfig(memoryConfig?: any): AgentConfig['memory'] {
    if (!memoryConfig) {
      return undefined
    }

    const result: AgentConfig['memory'] = {
      enabled: memoryConfig.enabled !== false, // デフォルト: true
    }

    // パス設定
    if (memoryConfig.path) {
      result.path = memoryConfig.path
    }

    // ベクトル検索設定
    if (memoryConfig.vector) {
      result.vector = {
        enabled: memoryConfig.vector.enabled === true, // デフォルト: false
      }
    }

    // Embedding設定
    if (memoryConfig.embedding) {
      result.embedding = {
        provider: this.getProvider(memoryConfig.embedding.provider),
        model: memoryConfig.embedding.model || 'text-embedding-3-large',
        apiKey: memoryConfig.embedding.apiKey,
        baseUrl: memoryConfig.embedding.baseUrl,
        region: memoryConfig.embedding.region,
        accessKeyId: memoryConfig.embedding.accessKeyId,
        secretAccessKey: memoryConfig.embedding.secretAccessKey,
      }
    }

    // Working Memory設定
    if (memoryConfig.workingMemory) {
      result.workingMemory = {
        enabled: memoryConfig.workingMemory.enabled === true, // デフォルト: false
      }
    }

    return result
  }

  /**
   * サブエージェント設定のパース
   */
  private parseSubAgentsConfig(subAgentsConfig?: any): SubAgentConfig[] | undefined {
    if (!subAgentsConfig || !Array.isArray(subAgentsConfig)) {
      return undefined
    }

    const subAgents: SubAgentConfig[] = []
    const seenIds = new Set<string>()

    for (const subAgent of subAgentsConfig) {
      if (!subAgent || typeof subAgent !== 'object') {
        throw new ConfigError('Invalid sub-agent configuration: each sub-agent must be an object')
      }

      // 必須項目の検証
      const requiredFields = ['id', 'name', 'systemPrompt']
      for (const field of requiredFields) {
        if (!subAgent[field] || typeof subAgent[field] !== 'string' || subAgent[field].trim() === '') {
          throw new ConfigError(`Sub-agent missing required field: ${field} (must be non-empty string)`)
        }
      }

      // IDの重複チェック
      const id = subAgent.id.trim()
      if (seenIds.has(id)) {
        throw new ConfigError(`Duplicate sub-agent ID: ${id}`)
      }
      seenIds.add(id)

      const parsedSubAgent: SubAgentConfig = {
        id,
        name: subAgent.name.trim(),
        systemPrompt: subAgent.systemPrompt.trim(),
        instructions: subAgent.instructions?.trim() || undefined,
        description: subAgent.description?.trim() || undefined,
      }

      // mcpFileの検証と正規化
      if (subAgent.mcpFile) {
        if (typeof subAgent.mcpFile !== 'string') {
          throw new ConfigError(`Sub-agent '${id}' has invalid mcpFile: must be string`)
        }
        
        const mcpFile = subAgent.mcpFile.trim()
        if (mcpFile === '') {
          // 空文字列の場合は未設定とみなす
        } else {
          // セキュリティ: config/ ディレクトリ外のパスは警告
          if (!mcpFile.startsWith('config/') && !mcpFile.startsWith('./config/')) {
            this.logger?.warn(`Sub-agent '${id}' mcpFile '${mcpFile}' is outside config/ directory. This may be a security risk.`)
          }
          parsedSubAgent.mcpFile = mcpFile
        }
      }

      // LLM設定のオーバーライド検証
      if (subAgent.llm) {
        const llmConfig: SubAgentLLMConfig = {}

        // プロバイダーの検証
        if (subAgent.llm.provider) {
          if (subAgent.llm.provider !== 'openai' && subAgent.llm.provider !== 'bedrock') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.provider: must be 'openai' or 'bedrock'`)
          }
          llmConfig.provider = subAgent.llm.provider
        }

        // モデルの検証
        if (subAgent.llm.model) {
          if (typeof subAgent.llm.model !== 'string' || subAgent.llm.model.trim() === '') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.model: must be non-empty string`)
          }
          llmConfig.model = subAgent.llm.model.trim()
        }

        // APIキーの検証
        if (subAgent.llm.apiKey) {
          if (typeof subAgent.llm.apiKey !== 'string') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.apiKey: must be string`)
          }
          llmConfig.apiKey = subAgent.llm.apiKey
        }

        // Base URLの検証
        if (subAgent.llm.baseUrl) {
          if (typeof subAgent.llm.baseUrl !== 'string') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.baseUrl: must be string`)
          }
          
          const baseUrl = subAgent.llm.baseUrl.trim()
          if (baseUrl === '') {
            // 空文字列の場合は未設定とみなす
          } else if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.baseUrl: must start with http:// or https://`)
          } else {
            // 末尾のスラッシュを除去
            llmConfig.baseUrl = baseUrl.replace(/\/+$/, '')
          }
        }

        // リージョンの検証
        if (subAgent.llm.region) {
          if (typeof subAgent.llm.region !== 'string' || subAgent.llm.region.trim() === '') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.region: must be non-empty string`)
          }
          llmConfig.region = subAgent.llm.region.trim()
        }

        // AWS認証情報の検証
        if (subAgent.llm.accessKeyId) {
          if (typeof subAgent.llm.accessKeyId !== 'string') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.accessKeyId: must be string`)
          }
          llmConfig.accessKeyId = subAgent.llm.accessKeyId
        }

        if (subAgent.llm.secretAccessKey) {
          if (typeof subAgent.llm.secretAccessKey !== 'string') {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.secretAccessKey: must be string`)
          }
          llmConfig.secretAccessKey = subAgent.llm.secretAccessKey
        }

        // reasoning設定の検証
        if (subAgent.llm.reasoning?.effort) {
          const validEfforts = ['minimal', 'low', 'medium', 'high']
          if (!validEfforts.includes(subAgent.llm.reasoning.effort)) {
            throw new ConfigError(`Sub-agent '${id}' has invalid llm.reasoning.effort: must be one of ${validEfforts.join(', ')}`)
          }
          llmConfig.reasoning = {
            effort: subAgent.llm.reasoning.effort,
          }
        }

        // LLM設定が空でない場合のみ追加
        if (Object.keys(llmConfig).length > 0) {
          parsedSubAgent.llm = llmConfig
        }
      }

      subAgents.push(parsedSubAgent)
    }

    return subAgents.length > 0 ? subAgents : undefined
  }

  /**
   * Slack設定のパース
   */
  private parseSlackConfig(slackConfig?: any): AgentConfig['slack'] {
    if (!slackConfig?.enabled) {
      return undefined
    }

    return {
      enabled: true,
      botToken: slackConfig.botToken || '',
      appToken: slackConfig.appToken || '',
      signingSecret: slackConfig.signingSecret || '',
      channels: slackConfig.channels || [],
    }
  }

  /**
   * ディープマージ
   */
  private deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target)
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] })
          } else {
            output[key] = this.deepMerge(target[key], source[key])
          }
        } else {
          Object.assign(output, { [key]: source[key] })
        }
      })
    }
    return output
  }

  /**
   * オブジェクト判定
   */
  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item)
  }

  /**
   * MCP設定を読み込む
   */
  async loadMCPConfig(): Promise<MCPServerConfig[]> {
    // キャッシュがあればそれを返す
    if (this.mcpConfigCache) {
      return this.mcpConfigCache
    }

    try {
      // MCP設定ファイルが存在しない場合は空配列を返す
      if (!(await this.fileExists(this.mcpConfigPath))) {
        console.warn(
          `MCP configuration file not found: ${this.mcpConfigPath}. No MCP servers will be loaded.`
        )
        this.mcpConfigCache = []
        return []
      }

      const mcpConfigFile = await readFile(this.mcpConfigPath, 'utf-8')

      let mcpConfig: MCPConfig
      try {
        mcpConfig = JSON.parse(mcpConfigFile)
      } catch (parseError) {
        throw new ConfigError('Invalid JSON in MCP configuration file', {
          path: this.mcpConfigPath,
          error: parseError,
        })
      }

      // mcpServersがない場合は空配列を返す
      if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
        console.warn('No mcpServers found in MCP configuration.')
        this.mcpConfigCache = []
        return []
      }

      const servers = Object.entries(mcpConfig.mcpServers)
        .filter(([name, config]) => {
          if (!config || typeof config !== 'object') {
            console.warn(`Invalid MCP server configuration for '${name}'. Skipping.`)
            return false
          }
          if (config.disabled) {
            console.info(`MCP server '${name}' is disabled.`)
            return false
          }
          return true
        })
        .map(([name, config]) => {
          // 必須フィールドの検証
          if (!config.command && (!config.type || config.type === "stdio")) {
            throw new ConfigError(`MCP server '${name}' missing required field: command`)
          }
          return {
            ...config,
            name,
          }
        })

      // キャッシュに保存
      this.mcpConfigCache = servers
      return servers
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error
      }
      throw new ConfigError(`Failed to load MCP configuration: ${error}`, {
        path: this.mcpConfigPath,
      })
    }
  }

  /**
   * 設定の検証（boolean返却、互換性のため残す）
   */
  validateConfig(config: AgentConfig): boolean {
    try {
      this.validateConfigWithDetails(config)
      return true
    } catch {
      return false
    }
  }

  /**
   * 設定の詳細な検証
   */
  private validateConfigWithDetails(config: AgentConfig): void {
    const errors: string[] = []

    // LLM設定の検証
    if (!config.llm.provider) {
      errors.push('LLM provider is required')
    }
    if (!config.llm.model) {
      errors.push('LLM model is required')
    }

    // プロバイダー固有の検証
    if (config.llm.provider === 'openai' && !config.llm.apiKey) {
      errors.push(
        'OpenAI API key is required. Please set it in config/agent.yml under llm.openai.apiKey'
      )
    }

    if (config.llm.provider === 'bedrock') {
      if (!config.llm.region) {
        errors.push(
          'AWS region is required for Bedrock. Please set it in config/agent.yml under llm.bedrock.region'
        )
      }
      // AWS認証情報の確認（明示的に設定されていない場合、IAMロールが使用されると仮定）
      if (!config.llm.accessKeyId && !config.llm.secretAccessKey) {
        this.logger?.info(
          'AWS credentials not found in config. IAM role will be used for authentication.'
        )
      }
    }

    // サブエージェント設定の検証
    if (config.subAgents && config.subAgents.length > 0) {
      // サブエージェントのIDが 'main' でないことを確認
      const mainAgentExists = config.subAgents.some(subAgent => subAgent.id === 'main')
      if (mainAgentExists) {
        errors.push("Sub-agent ID 'main' is reserved for the main agent and cannot be used")
      }

      // サブエージェントごとの検証
      for (const subAgent of config.subAgents) {
        // LLM設定オーバーライドの検証
        if (subAgent.llm) {
          // プロバイダーとモデルの組み合わせ検証
          if (subAgent.llm.provider === 'openai' && subAgent.llm.apiKey && !subAgent.llm.apiKey.trim()) {
            errors.push(`Sub-agent '${subAgent.id}' uses OpenAI provider but has empty apiKey`)
          }
          
          if (subAgent.llm.provider === 'bedrock' && subAgent.llm.region && !subAgent.llm.region.trim()) {
            errors.push(`Sub-agent '${subAgent.id}' uses Bedrock provider but has empty region`)
          }
        }
      }
    }

    // 数値パラメータの検証

    // Slack設定の検証（有効な場合）
    if (config.slack?.enabled) {
      if (!config.slack.botToken) {
        errors.push(
          'Slack bot token is required when Slack is enabled. Please set it in config/agent.yml under slack.botToken'
        )
      }
      if (!config.slack.appToken) {
        errors.push(
          'Slack app token is required when Slack is enabled. Please set it in config/agent.yml under slack.appToken'
        )
      }
      if (!config.slack.signingSecret) {
        errors.push(
          'Slack signing secret is required when Slack is enabled. Please set it in config/agent.yml under slack.signingSecret'
        )
      }
    }

    // エラーがある場合は例外を投げる
    if (errors.length > 0) {
      throw new ConfigError(errors[0], { errors })
    }
  }

  /**
   * 設定キャッシュをクリア（テスト用）
   */
  clearCache(): void {
    this.configCache = undefined
    this.mcpConfigCache = undefined
  }
}
