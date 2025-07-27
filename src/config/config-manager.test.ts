/**
 * Configuration Manager Tests
 * 設定管理のテスト
 */

import { mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigManagerImpl } from './config-manager.js'

describe('ConfigManagerImpl', () => {
  let configManager: ConfigManagerImpl
  let tempDir: string
  let configPath: string
  let mcpConfigPath: string

  beforeEach(async () => {
    // 一時ディレクトリを作成
    tempDir = join(tmpdir(), `config-test-${Date.now()}`)
    await mkdir(tempDir, { recursive: true })

    configPath = join(tempDir, 'agent.yml')
    mcpConfigPath = join(tempDir, 'mcp.json')

    configManager = new ConfigManagerImpl(configPath, mcpConfigPath)
  })

  afterEach(async () => {
    // 一時ディレクトリをクリーンアップ
    await rm(tempDir, { recursive: true, force: true })
    // 環境変数をリセット
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
    delete process.env.OPENAI_API_KEY
    delete process.env.AWS_REGION
    delete process.env.LOG_LEVEL
    delete process.env.LOG_FORMAT
    delete process.env.AGENT_SYSTEM_PROMPT
    delete process.env.SLACK_BOT_TOKEN
    delete process.env.SLACK_APP_TOKEN
    delete process.env.SLACK_SIGNING_SECRET
    delete process.env.SLACK_ENABLED
    delete process.env.LLM_MAX_TOKENS
    delete process.env.LLM_TEMPERATURE
  })

  describe('loadConfig', () => {
    it('設定ファイルが存在しない場合、APIキーエラーを投げる', async () => {
      await expect(configManager.loadConfig()).rejects.toThrow('OpenAI API key is required')
    })

    it('YAMLファイルから設定を読み込む', async () => {
      const yamlContent = `
server:
  port: 3000
agent:
  name: "Test Agent"
  systemPrompt: "Test prompt"
llm:
  provider: bedrock
  model: claude-3
  bedrock:
    region: us-west-2
    accessKeyId: test-key
    secretAccessKey: test-secret
logging:
  level: debug
  format: text
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.server?.port).toBe(3000)
      expect(config.agent?.name).toBe('Test Agent')
      expect(config.agent?.systemPrompt).toBe('Test prompt')
      expect(config.llm.provider).toBe('bedrock')
      expect(config.llm.model).toBe('claude-3')
      expect(config.llm.region).toBe('us-west-2')
      expect(config.llm.accessKeyId).toBe('test-key')
      expect(config.llm.secretAccessKey).toBe('test-secret')
      expect(config.logging.level).toBe('debug')
      expect(config.logging.format).toBe('text')
    })

    it('OpenAI設定を正しく読み込む', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-openai-key
logging:
  level: info
  format: json
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.llm.provider).toBe('openai')
      expect(config.llm.model).toBe('gpt-4')
      expect(config.llm.apiKey).toBe('test-openai-key')
      expect(config.llm.baseUrl).toBeUndefined()
      expect(config.logging.level).toBe('info')
      expect(config.logging.format).toBe('json')
    })

    it('OpenAI設定とbaseUrlを正しく読み込む', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-openai-key
    baseUrl: http://localhost:1234/v1
logging:
  level: info
  format: json
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.llm.provider).toBe('openai')
      expect(config.llm.model).toBe('gpt-4')
      expect(config.llm.apiKey).toBe('test-openai-key')
      expect(config.llm.baseUrl).toBe('http://localhost:1234/v1')
      expect(config.logging.level).toBe('info')
      expect(config.logging.format).toBe('json')
    })

    it('baseUrlの末尾スラッシュが除去される', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-openai-key
    baseUrl: http://localhost:1234/v1/
logging:
  level: info
  format: json
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.llm.baseUrl).toBe('http://localhost:1234/v1')
    })

    it('baseUrlが空文字列の場合は未設定とみなす', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-openai-key
    baseUrl: ""
logging:
  level: info
  format: json
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.llm.baseUrl).toBeUndefined()
    })

    it('baseUrlがhttp/httpsで始まらない場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-openai-key
    baseUrl: ftp://localhost:1234/v1
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('baseUrl must start with http:// or https://')
    })

    it('baseUrlが文字列でない場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-openai-key
    baseUrl: 123
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('baseUrl must be a string')
    })

    it('OpenAIプロバイダーでAPIキーがない場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: ""
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('OpenAI API key is required')
    })

    it('Bedrockプロバイダーでリージョンがない場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: bedrock
  model: claude-3
  bedrock:
    region: ""
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('AWS region is required')
    })

    it('無効なプロバイダーの場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: invalid-provider
  model: some-model
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('Invalid LLM provider')
    })

    it('Slack設定を正しく読み込む', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
slack:
  enabled: true
  botToken: xoxb-test
  appToken: xapp-test
  signingSecret: secret
  channels: ["general", "random"]
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.slack).toBeDefined()
      expect(config.slack?.botToken).toBe('xoxb-test')
      expect(config.slack?.appToken).toBe('xapp-test')
      expect(config.slack?.signingSecret).toBe('secret')
      expect(config.slack?.channels).toEqual(['general', 'random'])
    })

    it('エージェント設定を正しく読み込む', async () => {
      const yamlContent = `
agent:
  name: "Test Agent"
  description: "Test Description"
  systemPrompt: |
    あなたはテスト用のAIエージェントです。
    ユーザーの質問に丁寧に回答してください。
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.agent).toBeDefined()
      expect(config.agent?.name).toBe('Test Agent')
      expect(config.agent?.description).toBe('Test Description')
      expect(config.agent?.systemPrompt).toContain('あなたはテスト用のAIエージェントです')
      expect(config.agent?.systemPrompt).toContain('ユーザーの質問に丁寧に回答してください')
    })

    it('サーバー設定を正しく読み込む', async () => {
      const yamlContent = `
server:
  port: 8080
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.server?.port).toBe(8080)
    })

    it('キャッシュされた設定を返す', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
`
      await writeFile(configPath, yamlContent)

      const config1 = await configManager.loadConfig()
      const config2 = await configManager.loadConfig()

      expect(config1).toBe(config2) // 同じオブジェクト参照
    })

    it('サブエージェント設定を正しく読み込む', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "simple"
    name: "Simple Agent"
    systemPrompt: "You are a simple agent"
    instructions: "Be simple"
  - id: "research"
    name: "Research Agent"
    description: "Research specialist"
    systemPrompt: |
      You are a research agent.
      Provide detailed information.
    instructions: |
      - Always cite sources
      - Be thorough
    llm:
      model: "gpt-4o"
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toBeDefined()
      expect(config.subAgents).toHaveLength(2)

      const simpleAgent = config.subAgents![0]
      expect(simpleAgent.id).toBe('simple')
      expect(simpleAgent.name).toBe('Simple Agent')
      expect(simpleAgent.systemPrompt).toBe('You are a simple agent')
      expect(simpleAgent.instructions).toBe('Be simple')
      expect(simpleAgent.description).toBeUndefined()
      expect(simpleAgent.llm).toBeUndefined()

      const researchAgent = config.subAgents![1]
      expect(researchAgent.id).toBe('research')
      expect(researchAgent.name).toBe('Research Agent')
      expect(researchAgent.description).toBe('Research specialist')
      expect(researchAgent.systemPrompt).toContain('You are a research agent')
      expect(researchAgent.instructions).toContain('Always cite sources')
      expect(researchAgent.llm?.model).toBe('gpt-4o')
    })

    it('サブエージェントの必須フィールドが欠けている場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    # systemPrompt と instructions が欠けている
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('Sub-agent missing required field: systemPrompt')
    })

    it('サブエージェントのIDが重複している場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "duplicate"
    name: "Agent 1"
    systemPrompt: "Prompt 1"
    instructions: "Instructions 1"
  - id: "duplicate"
    name: "Agent 2"
    systemPrompt: "Prompt 2"
    instructions: "Instructions 2"
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow('Duplicate sub-agent ID: duplicate')
    })

    it('サブエージェントのIDがmainの場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "main"
    name: "Main Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow("Sub-agent ID 'main' is reserved for the main agent")
    })

    it('サブエージェントのllm.modelが空の場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    llm:
      model: ""
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow("Sub-agent 'test' has invalid llm.model: must be non-empty string")
    })

    it('サブエージェント設定が空の配列の場合undefinedになる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents: []
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toBeUndefined()
    })

    it('サブエージェントのフィールドが空白文字の場合トリムされる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "  test  "
    name: "  Test Agent  "
    systemPrompt: "  Test prompt  "
    instructions: "  Test instructions  "
    description: "  Test description  "
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(1)
      const agent = config.subAgents![0]
      expect(agent.id).toBe('test')
      expect(agent.name).toBe('Test Agent')
      expect(agent.systemPrompt).toBe('Test prompt')
      expect(agent.instructions).toBe('Test instructions')
      expect(agent.description).toBe('Test description')
    })

    it('サブエージェントの完全なLLM設定オーバーライドを正しく読み込む', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: main-key
sub_agents:
  - id: "bedrock-agent"
    name: "Bedrock Agent"
    systemPrompt: "You are a Bedrock agent"
    instructions: "Use AWS"
    llm:
      provider: "bedrock"
      model: "anthropic.claude-3-sonnet-20240229-v1:0"
      region: "us-west-2"
      accessKeyId: "test-access-key"
      secretAccessKey: "test-secret-key"
  - id: "openai-custom"
    name: "OpenAI Custom Agent"
    systemPrompt: "You are an OpenAI agent"
    instructions: "Use OpenAI"
    llm:
      provider: "openai"
      model: "gpt-4o"
      apiKey: "custom-openai-key"
      baseUrl: "https://api.custom.com/v1"
      reasoning:
        effort: "high"
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(2)

      const bedrockAgent = config.subAgents![0]
      expect(bedrockAgent.id).toBe('bedrock-agent')
      expect(bedrockAgent.llm?.provider).toBe('bedrock')
      expect(bedrockAgent.llm?.model).toBe('anthropic.claude-3-sonnet-20240229-v1:0')
      expect(bedrockAgent.llm?.region).toBe('us-west-2')
      expect(bedrockAgent.llm?.accessKeyId).toBe('test-access-key')
      expect(bedrockAgent.llm?.secretAccessKey).toBe('test-secret-key')

      const openaiAgent = config.subAgents![1]
      expect(openaiAgent.id).toBe('openai-custom')
      expect(openaiAgent.llm?.provider).toBe('openai')
      expect(openaiAgent.llm?.model).toBe('gpt-4o')
      expect(openaiAgent.llm?.apiKey).toBe('custom-openai-key')
      expect(openaiAgent.llm?.baseUrl).toBe('https://api.custom.com/v1')
      expect(openaiAgent.llm?.reasoning?.effort).toBe('high')
    })

    it('サブエージェントの無効なLLMプロバイダーの場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    llm:
      provider: "invalid-provider"
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow("Sub-agent 'test' has invalid llm.provider: must be 'openai' or 'bedrock'")
    })

    it('サブエージェントの無効なbaseUrlの場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    llm:
      provider: "openai"
      baseUrl: "ftp://invalid-url"
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow("Sub-agent 'test' has invalid llm.baseUrl: must start with http:// or https://")
    })

    it('サブエージェントの無効なreasoning effortの場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    llm:
      reasoning:
        effort: "invalid-effort"
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow("Sub-agent 'test' has invalid llm.reasoning.effort: must be one of minimal, low, medium, high")
    })

    it('サブエージェントの空のLLM設定は無視される', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    llm: {}
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(1)
      const agent = config.subAgents![0]
      expect(agent.llm).toBeUndefined()
    })

    it('サブエージェントのmcpFileを正しくパースする', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: "config/custom-mcp.json"
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(1)
      const agent = config.subAgents![0]
      expect(agent.mcpFile).toBe('config/custom-mcp.json')
    })

    it('サブエージェントのmcpFileが空文字列の場合undefinedになる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: ""
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(1)
      const agent = config.subAgents![0]
      expect(agent.mcpFile).toBeUndefined()
    })

    it('サブエージェントのmcpFileが空白のみの場合undefinedになる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: "   "
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(1)
      const agent = config.subAgents![0]
      expect(agent.mcpFile).toBeUndefined()
    })

    it('サブエージェントのmcpFile前後空白がトリムされる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: "  config/custom-mcp.json  "
`
      await writeFile(configPath, yamlContent)

      const config = await configManager.loadConfig()

      expect(config.subAgents).toHaveLength(1)
      const agent = config.subAgents![0]
      expect(agent.mcpFile).toBe('config/custom-mcp.json')
    })

    it('サブエージェントのmcpFileが文字列でない場合エラーを投げる', async () => {
      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: 123
`
      await writeFile(configPath, yamlContent)

      await expect(configManager.loadConfig()).rejects.toThrow("Sub-agent 'test' has invalid mcpFile: must be string")
    })

    it('サブエージェントのmcpFileがconfig/外の場合警告を出す（loggerあり）', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }
      
      const configManagerWithLogger = new ConfigManagerImpl(configPath, mcpConfigPath, mockLogger)

      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: "/etc/mcp.json"
`
      await writeFile(configPath, yamlContent)

      await configManagerWithLogger.loadConfig()

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Sub-agent 'test' mcpFile '/etc/mcp.json' is outside config/ directory. This may be a security risk."
      )
    })

    it('サブエージェントのmcpFileがconfig/内の場合警告を出さない', async () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }
      
      const configManagerWithLogger = new ConfigManagerImpl(configPath, mcpConfigPath, mockLogger)

      const yamlContent = `
llm:
  provider: openai
  model: gpt-4
  openai:
    apiKey: test-key
sub_agents:
  - id: "test"
    name: "Test Agent"
    systemPrompt: "Prompt"
    instructions: "Instructions"
    mcpFile: "config/custom-mcp.json"
`
      await writeFile(configPath, yamlContent)

      await configManagerWithLogger.loadConfig()

      expect(mockLogger.warn).not.toHaveBeenCalled()
    })
  })

  describe('loadMCPConfig', () => {
    it('MCPファイルが存在しない場合、空配列を返す', async () => {
      const servers = await configManager.loadMCPConfig()

      expect(servers).toEqual([])
    })

    it('MCP設定を正しく読み込む', async () => {
      const mcpContent = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
            disabled: false,
            autoApprove: ['read_file', 'write_file'],
          },
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            disabled: true,
          },
        },
      }
      await writeFile(mcpConfigPath, JSON.stringify(mcpContent, null, 2))

      const servers = await configManager.loadMCPConfig()

      expect(servers).toHaveLength(1)
      expect(servers[0].name).toBe('filesystem')
      expect(servers[0].command).toBe('npx')
      expect(servers[0].args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', './data'])
      expect(servers[0].autoApprove).toEqual(['read_file', 'write_file'])
    })

    it('無効なJSONの場合エラーを投げる', async () => {
      await writeFile(mcpConfigPath, '{ invalid json }')

      await expect(configManager.loadMCPConfig()).rejects.toThrow('Invalid JSON')
    })

    it('commandがないサーバーの場合エラーを投げる', async () => {
      const mcpContent = {
        mcpServers: {
          invalid: {
            args: ['test'],
          },
        },
      }
      await writeFile(mcpConfigPath, JSON.stringify(mcpContent))

      await expect(configManager.loadMCPConfig()).rejects.toThrow('missing required field: command')
    })

    it('キャッシュされたMCP設定を返す', async () => {
      const mcpContent = {
        mcpServers: {
          test: {
            command: 'test',
          },
        },
      }
      await writeFile(mcpConfigPath, JSON.stringify(mcpContent))

      const servers1 = await configManager.loadMCPConfig()
      const servers2 = await configManager.loadMCPConfig()

      expect(servers1).toBe(servers2) // 同じオブジェクト参照
    })
  })

  describe('validateConfig', () => {
    it('有効な設定の場合trueを返す', () => {
      const config = {
        llm: {
          provider: 'openai' as const,
          model: 'gpt-4',
          apiKey: 'test-key',
        },
        logging: {
          level: 'info',
          format: 'json',
        },
      }

      expect(configManager.validateConfig(config)).toBe(true)
    })

    it('無効な設定の場合falseを返す', () => {
      const config = {
        llm: {
          provider: 'openai' as const,
          model: 'gpt-4',
          // apiKeyがない
        },
        logging: {
          level: 'info',
          format: 'json',
        },
      } as any

      expect(configManager.validateConfig(config)).toBe(false)
    })
  })

  describe('clearCache', () => {
    it('キャッシュをクリアする', async () => {
      const yamlContent1 = `
llm:
  provider: openai
  model: gpt-3.5-turbo
  openai:
    apiKey: test-key
`
      await writeFile(configPath, yamlContent1)

      // キャッシュを作成
      const config1 = await configManager.loadConfig()
      expect(config1.llm.model).toBe('gpt-3.5-turbo')

      // キャッシュをクリア
      configManager.clearCache()

      // 新しい設定を書き込む
      const yamlContent2 = `
llm:
  provider: openai
  model: gpt-4o
  openai:
    apiKey: test-key
`
      await writeFile(configPath, yamlContent2)

      // 再度読み込むと新しい値が反映される
      const config2 = await configManager.loadConfig()
      expect(config2.llm.model).toBe('gpt-4o')
    })
  })
})
