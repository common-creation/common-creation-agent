import {
  MCPConfiguration,
  type Tool,
} from '@voltagent/core'

// MCPサーバー設定の型定義
interface VoltMCPServerConfig {
  name?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  type?: 'stdio' | 'sse' | 'http' | 'streamable-http'
  url?: string
  headers?: Record<string, string>
}
import { MCPConfigLoader } from './config-loader.js'
import { sanitizeTools } from './schema-sanitizer.js'
import type {
  MCPConnectionOptions,
  MCPError,
  MCPManagerInterface,
  MCPManagerOptions,
  MCPServer,
  MCPServersConfig,
  MCPTool,
  MCPToolset,
} from './types.js'

export class MCPManager implements MCPManagerInterface {
  private configLoader: MCPConfigLoader
  private mcpConfiguration?: MCPConfiguration
  private connectionOptions: MCPConnectionOptions
  private servers: Map<string, MCPServer> = new Map()
  private isInitialized: boolean = false
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(options: MCPManagerOptions = {}) {
    this.configLoader = new MCPConfigLoader(options.configPath)
    this.connectionOptions = {
      reconnectAttempts: 3,
      reconnectDelay: 5000,
      timeout: 30000,
      ...options.connectionOptions,
    }
  }

  async initializeServers(config?: MCPServersConfig): Promise<void> {
    try {
      const mcpConfig = config || (await this.configLoader.loadConfig())

      if (!mcpConfig.mcpServers || Object.keys(mcpConfig.mcpServers).length === 0) {
        console.warn('No MCP servers configured')
        return
      }

      const servers: Record<string, VoltMCPServerConfig> = {}

      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        if (serverConfig.disabled) {
          console.info(`MCP server ${serverName} is disabled, skipping`)
          continue
        }

        const server = this.createServerConfig(serverName, serverConfig)
        servers[serverName] = server
        this.servers.set(serverName, server as MCPServer)
      }

      this.mcpConfiguration = new MCPConfiguration({ servers: servers as any })

      // MCPConfigurationはgetToolsを呼ぶことで自動的に接続される
      this.isInitialized = true
      console.info(`MCP servers initialized successfully: ${JSON.stringify(servers, null, 20)}`)
    } catch (error: any) {
      console.error('Failed to initialize MCP servers:', error)
      throw this.createMCPError('Failed to initialize MCP servers', 'configuration', error)
    }
  }

  private createServerConfig(serverName: string, config: VoltMCPServerConfig): VoltMCPServerConfig {
    if (config.url?.startsWith('http://') || config.url?.startsWith('https://')) {
      const serverConfig: VoltMCPServerConfig = {
        name: serverName,
        type: config.type as any,
        url: config.url,
      }
      return serverConfig
    } else {
      const serverConfig: VoltMCPServerConfig = {
        name: serverName,
        type: 'stdio' as const,
        command: config.command!,
        args: config.args,
        env: config.env,
      }
      return serverConfig
    }
  }

  private async connectWithRetry(): Promise<Tool<any>[]> {
    const attempts = this.connectionOptions.reconnectAttempts || 3
    const delay = this.connectionOptions.reconnectDelay || 5000

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (!this.mcpConfiguration) {
          throw new Error('MCP configuration not initialized')
        }

        console.info(`Attempting to get tools from MCP servers (attempt ${attempt}/${attempts})`)

        const tools = await this.mcpConfiguration.getTools()

        console.info('Successfully connected to MCP servers')
        return tools
      } catch (error: any) {
        console.error(
          `Failed to get tools from MCP servers (attempt ${attempt}/${attempts}):`,
          error.message
        )

        if (attempt < attempts) {
          console.info(`Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        } else {
          throw this.createMCPError(
            'Failed to connect after multiple attempts',
            'connection',
            error,
            true
          )
        }
      }
    }
    return []
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    this.ensureInitialized()

    try {
      if (!this.mcpConfiguration) {
        return []
      }

      const tools = await this.mcpConfiguration.getTools()

      // ツールスキーマをサニタイズしてJSON Schema互換性を確保
      const sanitizedTools = sanitizeTools(tools)

      console.info(`Sanitized ${tools.length} tools, ${sanitizedTools.length} tools are valid`)

      return sanitizedTools
    } catch (error: any) {
      console.error('Failed to get available tools:', error)
      throw this.createMCPError('Failed to get available tools', 'protocol', error)
    }
  }

  async getToolsets(): Promise<MCPToolset[]> {
    this.ensureInitialized()

    try {
      if (!this.mcpConfiguration) {
        return []
      }

      // getToolsetsメソッドが存在しない場合の代替実装
      const tools = await this.getAvailableTools()
      const toolsetMap = new Map<string, MCPTool[]>()

      // ツールをサーバーごとにグループ化
      tools.forEach((tool) => {
        const serverName = (tool as any).server || 'default'
        if (!toolsetMap.has(serverName)) {
          toolsetMap.set(serverName, [])
        }
        toolsetMap.get(serverName)!.push(tool)
      })

      return Array.from(toolsetMap.entries()).map(([server, tools]) => ({
        server,
        tools,
      }))
    } catch (error: any) {
      console.error('Failed to get toolsets:', error)
      throw this.createMCPError('Failed to get toolsets', 'protocol', error)
    }
  }

  async executeToolCall(toolName: string, params: any): Promise<any> {
    this.ensureInitialized()

    try {
      const tools = await this.getAvailableTools()
      const tool = tools.find((t) => t.name === toolName)

      if (!tool) {
        throw new Error(`Tool ${toolName} not found`)
      }

      const handler = (tool as any).execute || (tool as any).handler
      if (!handler || typeof handler !== 'function') {
        throw new Error(`Tool ${toolName} does not have a handler`)
      }

      console.info(`Executing tool call: ${toolName}`, { params })

      const result = await handler(params)

      console.info(`Tool call completed: ${toolName}`)

      return result
    } catch (error: any) {
      console.error(`Failed to execute tool call ${toolName}:`, error)
      throw this.createMCPError(`Failed to execute tool call ${toolName}`, 'protocol', error)
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.reconnectTimers.forEach((timer) => {
        clearTimeout(timer)
      })
      this.reconnectTimers.clear()

      if (this.mcpConfiguration) {
        await this.mcpConfiguration.disconnect()
        this.mcpConfiguration = undefined
      }

      this.servers.clear()
      this.isInitialized = false

      console.info('MCP servers disconnected successfully')
    } catch (error: any) {
      console.error('Error during disconnect:', error)
      throw this.createMCPError('Failed to disconnect MCP servers', 'connection', error)
    }
  }

  isConnected(serverName?: string): boolean {
    if (!this.isInitialized || !this.mcpConfiguration) {
      return false
    }

    if (serverName) {
      return this.servers.has(serverName)
    }

    return true
  }

  async reconnect(serverName?: string): Promise<void> {
    try {
      console.info(`Reconnecting to MCP servers${serverName ? ` (${serverName})` : ''}`)

      if (this.isInitialized && this.mcpConfiguration) {
        await this.mcpConfiguration.disconnect()
      }

      // getToolsを呼ぶことで再接続
      await this.connectWithRetry()
    } catch (error: any) {
      console.error('Failed to reconnect:', error)
      throw this.createMCPError('Failed to reconnect to MCP servers', 'connection', error, true)
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('MCP Manager not initialized. Call initializeServers() first.')
    }
  }

  private createMCPError(
    message: string,
    type: MCPError['type'],
    originalError?: Error,
    retryable: boolean = false
  ): MCPError {
    const error = new Error(message) as MCPError
    error.type = type
    error.retryable = retryable

    if (originalError) {
      error.stack = originalError.stack
    }

    return error
  }
}
