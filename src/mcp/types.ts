export interface MCPServerConfig {
  type?: 'streamable-http' | 'http' | 'sse' | 'stdio'
  url?: string
  headers?: Record<string, string>
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}

export interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>
}

export interface MCPServer {
  type: 'streamable-http' | 'http' | 'sse' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema?: Record<string, any>
  handler?: (params: any) => Promise<any>
  server?: string
}

export interface MCPToolset {
  server: string
  tools: MCPTool[]
}

export interface MCPConnectionOptions {
  reconnectAttempts?: number
  reconnectDelay?: number
  timeout?: number
}

export interface MCPManagerOptions {
  configPath?: string
  connectionOptions?: MCPConnectionOptions
}

export interface MCPError extends Error {
  type: 'connection' | 'protocol' | 'timeout' | 'configuration'
  serverName?: string
  retryable?: boolean
}

export interface MCPManagerInterface {
  initializeServers(config?: MCPServersConfig): Promise<void>
  getAvailableTools(): Promise<MCPTool[]>
  getToolsets(): Promise<MCPToolset[]>
  executeToolCall(toolName: string, params: any): Promise<any>
  disconnect(): Promise<void>
  isConnected(serverName?: string): boolean
  reconnect(serverName?: string): Promise<void>
}
