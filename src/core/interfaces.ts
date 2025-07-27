/**
 * Core Interface Definitions
 * システムの主要インターフェース定義
 */

import {
  type AgentConfig,
  type AgentResponse,
  type ConversationContext,
  type MCPServerConfig,
  ToolCall,
} from './types.js'

// エージェントコアインターフェース
export interface AgentCore {
  processMessage(message: string, context: ConversationContext): Promise<AgentResponse>
  initializeAgent(config: AgentConfig): Promise<void>
  shutdown(): Promise<void>
}

// MCP管理インターフェース
export interface MCPManager {
  initializeServers(config: MCPServerConfig[]): Promise<void>
  getAvailableTools(): Promise<Tool[]>
  executeToolCall(toolName: string, params: any): Promise<any>
  disconnect(): Promise<void>
}

// ツール定義
export interface Tool {
  name: string
  description: string
  parameters: Record<string, any>
}

// 設定管理インターフェース
export interface ConfigManager {
  loadConfig(): Promise<AgentConfig>
  loadMCPConfig(): Promise<MCPServerConfig[]>
  validateConfig(config: AgentConfig): boolean
}

// ログ管理インターフェース
export interface Logger {
  error(message: string, meta?: any): void
  warn(message: string, meta?: any): void
  info(message: string, meta?: any): void
  debug(message: string, meta?: any): void
}
