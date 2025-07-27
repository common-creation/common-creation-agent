import { MCPConfiguration } from '@voltagent/core'
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest'
import { MCPConfigLoader } from './config-loader.js'
import { MCPManager } from './mcp-manager.js'
import type { MCPServersConfig } from './types.js'

vi.mock('./config-loader.js')
vi.mock('@voltagent/core')

describe('MCPManager', () => {
  let mcpManager: MCPManager
  let mockConfigLoader: MCPConfigLoader
  let mockMCPConfiguration: MCPConfiguration

  const mockConfig: MCPServersConfig = {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
        disabled: false,
        autoApprove: ['read_file', 'write_file'],
      },
      httpServer: {
        command: 'https://example.com/mcp',
        disabled: false,
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockConfigLoader = {
      loadConfig: vi.fn().mockResolvedValue(mockConfig),
      getConfigPath: vi.fn().mockReturnValue('/test/config/mcp.json'),
    } as any

    mockMCPConfiguration = {
      disconnect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn().mockResolvedValue([]),
    } as any

    vi.mocked(MCPConfigLoader).mockImplementation(() => mockConfigLoader)
    vi.mocked(MCPConfiguration).mockImplementation(() => mockMCPConfiguration)

    mcpManager = new MCPManager()
  })

  describe('initializeServers', () => {
    it('should initialize servers from config', async () => {
      await mcpManager.initializeServers()

      expect(mockConfigLoader.loadConfig).toHaveBeenCalled()
      expect(MCPConfiguration).toHaveBeenCalledWith({
        servers: expect.objectContaining({
          filesystem: expect.objectContaining({
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
          }),
          httpServer: expect.objectContaining({
            type: 'http',
            url: 'https://example.com/mcp',
          }),
        }),
      })
    })

    it('should skip disabled servers', async () => {
      const configWithDisabled: MCPServersConfig = {
        mcpServers: {
          ...mockConfig.mcpServers,
          disabledServer: {
            command: 'test',
            disabled: true,
          },
        },
      }

      await mcpManager.initializeServers(configWithDisabled)

      expect(MCPConfiguration).toHaveBeenCalledWith({
        servers: expect.not.objectContaining({
          disabledServer: expect.anything(),
        }),
      })
    })

    it('should handle empty configuration', async () => {
      mockConfigLoader.loadConfig = vi.fn().mockResolvedValue({ mcpServers: {} })

      await mcpManager.initializeServers()

      expect(MCPConfiguration).not.toHaveBeenCalled()
    })

    it('should initialize even if getTools fails initially', async () => {
      await mcpManager.initializeServers()

      expect(MCPConfiguration).toHaveBeenCalled()
    })

    it('should handle configuration errors', async () => {
      vi.mocked(MCPConfiguration).mockImplementationOnce(() => {
        throw new Error('Invalid configuration')
      })

      await expect(mcpManager.initializeServers()).rejects.toThrow(
        'Failed to initialize MCP servers'
      )
    })

    it('should detect streamable-http server type', async () => {
      const streamableConfig: MCPServersConfig = {
        mcpServers: {
          streamServer: {
            command: 'https://example.com/stream/mcp',
            disabled: false,
          },
        },
      }

      await mcpManager.initializeServers(streamableConfig)

      expect(MCPConfiguration).toHaveBeenCalledWith({
        servers: expect.objectContaining({
          streamServer: expect.objectContaining({
            type: 'streamable-http',
            url: 'https://example.com/stream/mcp',
          }),
        }),
      })
    })
  })

  describe('getAvailableTools', () => {
    beforeEach(async () => {
      await mcpManager.initializeServers()
    })

    it('should return available tools', async () => {
      const mockTools = [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: { type: 'object' },
          handler: vi.fn(),
          server: 'filesystem',
        },
      ]

      mockMCPConfiguration.getTools = vi.fn().mockResolvedValue(mockTools)

      const tools = await mcpManager.getAvailableTools()

      expect(tools).toEqual(mockTools)
      expect(mockMCPConfiguration.getTools).toHaveBeenCalled()
    })

    it('should throw if not initialized', async () => {
      const uninitializedManager = new MCPManager()

      await expect(uninitializedManager.getAvailableTools()).rejects.toThrow(
        'MCP Manager not initialized'
      )
    })

    it('should handle getTools error', async () => {
      mockMCPConfiguration.getTools = vi.fn().mockRejectedValue(new Error('Failed to get tools'))

      await expect(mcpManager.getAvailableTools()).rejects.toThrow('Failed to get available tools')
    })
  })

  describe('getToolsets', () => {
    beforeEach(async () => {
      await mcpManager.initializeServers()
    })

    it('should return toolsets', async () => {
      const mockTools = [
        {
          name: 'read_file',
          description: 'Read a file',
          inputSchema: { type: 'object' },
          handler: vi.fn(),
          server: 'filesystem',
        },
      ]

      mockMCPConfiguration.getTools = vi.fn().mockResolvedValue(mockTools)

      const toolsets = await mcpManager.getToolsets()

      expect(toolsets).toEqual([
        {
          server: 'filesystem',
          tools: mockTools,
        },
      ])
    })
  })

  describe('executeToolCall', () => {
    const mockHandler = vi.fn()

    beforeEach(async () => {
      const mockTools = [
        {
          name: 'test_tool',
          description: 'Test tool',
          execute: mockHandler,
        },
      ]

      mockMCPConfiguration.getTools = vi.fn().mockResolvedValue(mockTools)
      await mcpManager.initializeServers()
    })

    it('should execute tool call', async () => {
      mockHandler.mockResolvedValue({ result: 'success' })

      const result = await mcpManager.executeToolCall('test_tool', { param: 'value' })

      expect(result).toEqual({ result: 'success' })
      expect(mockHandler).toHaveBeenCalledWith({ param: 'value' })
    })

    it('should throw if tool not found', async () => {
      await expect(mcpManager.executeToolCall('unknown_tool', {})).rejects.toThrow(
        'Failed to execute tool call unknown_tool'
      )
    })

    it('should throw if tool has no handler', async () => {
      const toolWithoutHandler = [
        {
          name: 'no_handler_tool',
          description: 'Tool without handler',
        },
      ]
      mockMCPConfiguration.getTools = vi.fn().mockResolvedValue(toolWithoutHandler)

      await expect(mcpManager.executeToolCall('no_handler_tool', {})).rejects.toThrow(
        'Failed to execute tool call no_handler_tool'
      )
    })

    it('should handle tool execution error', async () => {
      mockHandler.mockRejectedValue(new Error('Tool execution failed'))

      await expect(mcpManager.executeToolCall('test_tool', {})).rejects.toThrow(
        'Failed to execute tool call test_tool'
      )
    })
  })

  describe('disconnect', () => {
    it('should disconnect MCP configuration', async () => {
      await mcpManager.initializeServers()
      await mcpManager.disconnect()

      expect(mockMCPConfiguration.disconnect).toHaveBeenCalled()
      expect(mcpManager.isConnected()).toBe(false)
    })

    it('should handle disconnect error', async () => {
      await mcpManager.initializeServers()
      mockMCPConfiguration.disconnect = vi.fn().mockRejectedValue(new Error('Disconnect failed'))

      await expect(mcpManager.disconnect()).rejects.toThrow('Failed to disconnect MCP servers')
    })
  })

  describe('isConnected', () => {
    it('should return false when not initialized', () => {
      expect(mcpManager.isConnected()).toBe(false)
    })

    it('should return true when initialized', async () => {
      await mcpManager.initializeServers()
      expect(mcpManager.isConnected()).toBe(true)
    })

    it('should check specific server connection', async () => {
      await mcpManager.initializeServers()

      expect(mcpManager.isConnected('filesystem')).toBe(true)
      expect(mcpManager.isConnected('unknown')).toBe(false)
    })
  })

  describe('reconnect', () => {
    it('should reconnect successfully', async () => {
      await mcpManager.initializeServers()
      await mcpManager.reconnect()

      expect(mockMCPConfiguration.disconnect).toHaveBeenCalled()
      expect(mockMCPConfiguration.getTools).toHaveBeenCalled()
    })

    it('should handle reconnect failure', async () => {
      const uninitializedManager = new MCPManager({
        connectionOptions: { reconnectAttempts: 1, reconnectDelay: 100 },
      })

      mockMCPConfiguration.getTools = vi.fn().mockRejectedValue(new Error('Reconnect failed'))
      await uninitializedManager.initializeServers()

      await expect(uninitializedManager.reconnect()).rejects.toThrow(
        'Failed to reconnect to MCP servers'
      )
    })
  })
})
