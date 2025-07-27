import fs from 'fs/promises'
import path from 'path'
import type { MCPServerConfig, MCPServersConfig } from './types.js'

export class MCPConfigLoader {
  private configPath: string

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'mcp.json')
  }

  async loadConfig(): Promise<MCPServersConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8')
      const config = JSON.parse(configContent) as MCPServersConfig

      this.validateConfig(config)

      return config
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn(
          `MCP configuration file not found at ${this.configPath}. Using default configuration.`
        )
        return { mcpServers: {} }
      }

      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in MCP configuration file: ${error.message}`)
      }

      throw error
    }
  }

  private validateConfig(config: MCPServersConfig): void {
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      throw new Error('Invalid MCP configuration: mcpServers must be an object')
    }

    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      this.validateServerConfig(serverName, serverConfig)
    }
  }

  private validateServerConfig(serverName: string, config: MCPServerConfig): void {
    if ((!config.command || typeof config.command !== 'string') && (!config.type || config.type === "stdio")) {
      throw new Error(
        `Invalid MCP server configuration for ${serverName}: command is required and must be a string`
      )
    }

    if (config.args && !Array.isArray(config.args)) {
      throw new Error(`Invalid MCP server configuration for ${serverName}: args must be an array`)
    }

    if (config.env && typeof config.env !== 'object') {
      throw new Error(`Invalid MCP server configuration for ${serverName}: env must be an object`)
    }

    if (config.disabled !== undefined && typeof config.disabled !== 'boolean') {
      throw new Error(
        `Invalid MCP server configuration for ${serverName}: disabled must be a boolean`
      )
    }

    if (config.autoApprove && !Array.isArray(config.autoApprove)) {
      throw new Error(
        `Invalid MCP server configuration for ${serverName}: autoApprove must be an array`
      )
    }
  }

  getConfigPath(): string {
    return this.configPath
  }
}
