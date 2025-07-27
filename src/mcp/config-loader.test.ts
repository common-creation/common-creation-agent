import fs from 'fs/promises'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPConfigLoader } from './config-loader.js'

vi.mock('fs/promises')

describe('MCPConfigLoader', () => {
  let configLoader: MCPConfigLoader
  const mockConfigPath = '/test/config/mcp.json'

  beforeEach(() => {
    configLoader = new MCPConfigLoader(mockConfigPath)
    vi.clearAllMocks()
  })

  describe('loadConfig', () => {
    it('should load valid configuration', async () => {
      const validConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
            disabled: false,
            autoApprove: ['read_file', 'write_file'],
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(validConfig))

      const result = await configLoader.loadConfig()

      expect(result).toEqual(validConfig)
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf-8')
    })

    it('should return empty config when file not found', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' })

      const result = await configLoader.loadConfig()

      expect(result).toEqual({ mcpServers: {} })
    })

    it('should throw error for invalid JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json')

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid JSON in MCP configuration file'
      )
    })

    it('should throw error for invalid configuration structure', async () => {
      const invalidConfig = {
        // Missing mcpServers
        servers: {},
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig))

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid MCP configuration: mcpServers must be an object'
      )
    })

    it('should validate server configuration', async () => {
      const invalidServerConfig = {
        mcpServers: {
          testServer: {
            // Missing required command field
            args: ['test'],
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidServerConfig))

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid MCP server configuration for testServer: command is required'
      )
    })

    it('should validate args type', async () => {
      const invalidArgsConfig = {
        mcpServers: {
          testServer: {
            command: 'test',
            args: 'not-an-array', // Should be array
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidArgsConfig))

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid MCP server configuration for testServer: args must be an array'
      )
    })

    it('should validate env type', async () => {
      const invalidEnvConfig = {
        mcpServers: {
          testServer: {
            command: 'test',
            env: 'not-an-object', // Should be object
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidEnvConfig))

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid MCP server configuration for testServer: env must be an object'
      )
    })

    it('should validate disabled type', async () => {
      const invalidDisabledConfig = {
        mcpServers: {
          testServer: {
            command: 'test',
            disabled: 'not-a-boolean', // Should be boolean
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidDisabledConfig))

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid MCP server configuration for testServer: disabled must be a boolean'
      )
    })

    it('should validate autoApprove type', async () => {
      const invalidAutoApproveConfig = {
        mcpServers: {
          testServer: {
            command: 'test',
            autoApprove: 'not-an-array', // Should be array
          },
        },
      }

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidAutoApproveConfig))

      await expect(configLoader.loadConfig()).rejects.toThrow(
        'Invalid MCP server configuration for testServer: autoApprove must be an array'
      )
    })
  })

  describe('getConfigPath', () => {
    it('should return the config path', () => {
      expect(configLoader.getConfigPath()).toBe(mockConfigPath)
    })

    it('should use default path when not specified', () => {
      const defaultLoader = new MCPConfigLoader()
      expect(defaultLoader.getConfigPath()).toBe(path.join(process.cwd(), 'config', 'mcp.json'))
    })
  })
})
