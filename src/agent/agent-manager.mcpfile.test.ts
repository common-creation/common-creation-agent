/**
 * Agent Manager MCP File Tests
 * サブエージェント mcpFile 機能のテスト
 */

import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentManagerImpl } from './agent-manager.js'
import type { AgentConfig, Logger } from '../core/types.js'

// Mock logger
const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

describe('AgentManagerImpl - MCP File Support', () => {
  let agentManager: AgentManagerImpl
  let tempDir: string
  let configPath: string
  let mcpConfigPath: string
  let subAgentMcpPath: string

  beforeEach(async () => {
    // 一時ディレクトリを作成
    tempDir = join(tmpdir(), `agent-mcp-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })
    await mkdir(join(tempDir, 'config'), { recursive: true })

    configPath = join(tempDir, 'config', 'agent.yml')
    mcpConfigPath = join(tempDir, 'config', 'mcp.json')
    subAgentMcpPath = join(tempDir, 'config', 'subagent-mcp.json')

    // メインMCP設定ファイルを作成
    const mainMcpConfig = {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
        },
      },
    }
    await writeFile(mcpConfigPath, JSON.stringify(mainMcpConfig, null, 2))

    // サブエージェント用MCP設定ファイルを作成
    const subAgentMcpConfig = {
      mcpServers: {
        fetch: {
          command: 'uvx',
          args: ['mcp-server-fetch'],
        },
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        },
      },
    }
    await writeFile(subAgentMcpPath, JSON.stringify(subAgentMcpConfig, null, 2))

    // エージェント設定を作成
    const agentConfig: AgentConfig = {
      llm: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
      },
      logging: {
        level: 'info',
        format: 'json',
      },
      subAgents: [
        {
          id: 'simple',
          name: 'Simple Agent',
          systemPrompt: 'You are simple',
          instructions: 'Be simple',
          // mcpFile未指定
        },
        {
          id: 'research',
          name: 'Research Agent',
          systemPrompt: 'You are research',
          instructions: 'Do research',
          mcpFile: 'config/subagent-mcp.json', // 個別MCPファイル指定
        },
      ],
    }

    await writeFile(configPath, `
llm:
  provider: openai
  model: gpt-4o-mini
  apiKey: test-key
logging:
  level: info
  format: json
sub_agents:
  - id: simple
    name: "Simple Agent"
    systemPrompt: "You are simple"
    instructions: "Be simple"
  - id: research
    name: "Research Agent"
    systemPrompt: "You are research"
    instructions: "Do research"
    mcpFile: "config/subagent-mcp.json"
`)

    agentManager = new AgentManagerImpl(
      agentConfig,
      { id: 'main', name: 'Main Agent', description: 'Main', instructions: 'Main' },
      mockLogger
    )

    // 環境変数をモック
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
  })

  afterEach(async () => {
    // 一時ディレクトリをクリーンアップ
    await rm(tempDir, { recursive: true, force: true })
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  describe('Sub-agent MCP file loading', () => {
    it('should load different MCP tools for different sub-agents', async () => {
      // MCPManagerをモック（実際のMCPサーバー起動を回避）
      const mockMcpManager = {
        initializeServers: vi.fn().mockResolvedValue(undefined),
        getAvailableTools: vi.fn().mockResolvedValue([
          { name: 'fetch', description: 'Fetch web content' },
          { name: 'context7_resolve', description: 'Resolve library' },
        ]),
        disconnect: vi.fn().mockResolvedValue(undefined),
      }

      // MCPManagerのコンストラクタをモック
      vi.doMock('../mcp/index.js', () => ({
        MCPManager: vi.fn(() => mockMcpManager),
      }))

      await agentManager.initialize()

      // サブエージェントが作成されたことを確認
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Sub-agent created: simple'))
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Sub-agent created: research'))

      // simpleエージェントはツールなし（0ツール）
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sub-agent created: simple with 0 MCP tools')
      )

      // researchエージェントは2ツール
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sub-agent created: research with 2 MCP tools')
      )
    })

    it('should handle missing MCP file gracefully', async () => {
      // 存在しないMCPファイルを指定
      const configPathMissing = join(tempDir, 'config', 'agent-missing.yml')
      await writeFile(configPathMissing, `
llm:
  provider: openai
  model: gpt-4o-mini
  apiKey: test-key
logging:
  level: info
  format: json
sub_agents:
  - id: missing
    name: "Missing MCP Agent"
    systemPrompt: "You are missing"
    instructions: "Handle missing"
    mcpFile: "config/nonexistent-mcp.json"
`)

      const agentConfigMissing: AgentConfig = {
        llm: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          apiKey: 'test-key',
        },
        logging: {
          level: 'info',
          format: 'json',
        },
        subAgents: [
          {
            id: 'missing',
            name: 'Missing MCP Agent',
            systemPrompt: 'You are missing',
            instructions: 'Handle missing',
            mcpFile: 'config/nonexistent-mcp.json',
          },
        ],
      }

      const agentManagerMissing = new AgentManagerImpl(
        agentConfigMissing,
        { id: 'main', name: 'Main Agent', description: 'Main', instructions: 'Main' },
        mockLogger
      )

      await agentManagerMissing.initialize()

      // 警告ログが出力されることを確認
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('MCP configuration file not found for sub-agent')
      )

      // エージェントはツールなしで作成されることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sub-agent created: missing with 0 MCP tools')
      )
    })

    it('should reject MCP files outside config directory', async () => {
      // config/外のMCPファイルを指定
      const configPathOutside = join(tempDir, 'config', 'agent-outside.yml')
      await writeFile(configPathOutside, `
llm:
  provider: openai
  model: gpt-4o-mini
  apiKey: test-key
logging:
  level: info
  format: json
sub_agents:
  - id: outside
    name: "Outside MCP Agent"
    systemPrompt: "You are outside"
    instructions: "Handle outside"
    mcpFile: "/etc/passwd"
`)

      const agentConfigOutside: AgentConfig = {
        llm: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          apiKey: 'test-key',
        },
        logging: {
          level: 'info',
          format: 'json',
        },
        subAgents: [
          {
            id: 'outside',
            name: 'Outside MCP Agent',
            systemPrompt: 'You are outside',
            instructions: 'Handle outside',
            mcpFile: '/etc/passwd',
          },
        ],
      }

      const agentManagerOutside = new AgentManagerImpl(
        agentConfigOutside,
        { id: 'main', name: 'Main Agent', description: 'Main', instructions: 'Main' },
        mockLogger
      )

      await agentManagerOutside.initialize()

      // 警告ログが出力されることを確認
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("mcpFile '/etc/passwd' is outside config/ directory")
      )

      // エージェントはツールなしで作成されることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sub-agent created: outside with 0 MCP tools')
      )
    })

    it('should handle invalid JSON in MCP file', async () => {
      // 不正なJSONファイルを作成
      const invalidMcpPath = join(tempDir, 'config', 'invalid-mcp.json')
      await writeFile(invalidMcpPath, '{ invalid json }')

      const configPathInvalid = join(tempDir, 'config', 'agent-invalid.yml')
      await writeFile(configPathInvalid, `
llm:
  provider: openai
  model: gpt-4o-mini
  apiKey: test-key
logging:
  level: info
  format: json
sub_agents:
  - id: invalid
    name: "Invalid MCP Agent"
    systemPrompt: "You are invalid"
    instructions: "Handle invalid"
    mcpFile: "config/invalid-mcp.json"
`)

      const agentConfigInvalid: AgentConfig = {
        llm: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          apiKey: 'test-key',
        },
        logging: {
          level: 'info',
          format: 'json',
        },
        subAgents: [
          {
            id: 'invalid',
            name: 'Invalid MCP Agent',
            systemPrompt: 'You are invalid',
            instructions: 'Handle invalid',
            mcpFile: 'config/invalid-mcp.json',
          },
        ],
      }

      const agentManagerInvalid = new AgentManagerImpl(
        agentConfigInvalid,
        { id: 'main', name: 'Main Agent', description: 'Main', instructions: 'Main' },
        mockLogger
      )

      await agentManagerInvalid.initialize()

      // 警告ログが出力されることを確認
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load MCP configuration for sub-agent')
      )

      // エージェントはツールなしで作成されることを確認
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Sub-agent created: invalid with 0 MCP tools')
      )
    })
  })
})