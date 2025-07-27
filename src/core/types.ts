/**
 * Core Type Definitions
 * システム全体で使用される型定義
 */

// 会話コンテキスト
export interface ConversationContext {
  sessionId: string
  userId: string
  channelId?: string // Slack用
  history: Message[]
  metadata: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

// コンテンツパートの型定義（マルチモーダル対応）
export interface TextContentPart {
  type: 'text'
  text: string
}

export interface ImageContentPart {
  type: 'image'
  image: string // Base64エンコードされた画像データまたはData URI
  mimeType?: string // 画像のMIMEタイプ（例: image/jpeg, image/png）
}

export type ContentPart = TextContentPart | ImageContentPart

// メッセージ
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | ContentPart[] // テキストまたはマルチモーダルコンテンツ
  timestamp: Date
  metadata?: Record<string, any>
}

// エージェント応答
export interface AgentResponse {
  content: string
  toolCalls?: ToolCall[]
  metadata?: Record<string, any>
  error?: string
}

// ツール呼び出し
export interface ToolCall {
  toolName: string
  parameters: Record<string, any>
  result?: any
  error?: string
}

// サブエージェントLLM設定（メインLLM設定のオーバーライド用）
export interface SubAgentLLMConfig {
  provider?: 'openai' | 'bedrock' // 任意: LLMプロバイダーのオーバーライド
  model?: string // 任意: LLMモデルのオーバーライド
  apiKey?: string // 任意: APIキーのオーバーライド（OpenAI用）
  baseUrl?: string // 任意: OpenAI互換サーバーのベースURL（LM Studioなど）
  region?: string // 任意: AWSリージョン（Bedrock用）
  accessKeyId?: string // 任意: AWSアクセスキー（Bedrock用）
  secretAccessKey?: string // 任意: AWSシークレットアクセスキー（Bedrock用）
  reasoning?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high' // GPT-5用
  }
}

// サブエージェント設定
export interface SubAgentConfig {
  id: string // 必須: 一意の識別子
  name: string // 必須: エージェント名
  systemPrompt: string // 必須: システムプロンプト
  instructions: string // 必須: 命令
  description?: string // 任意: 説明
  llm?: SubAgentLLMConfig // 任意: LLM設定のオーバーライド
  mcpFile?: string // 任意: サブエージェント専用MCP設定ファイルパス（config/内）
  // 将来的な拡張用: ツールセット個別指定、個別メモリ設定など
}

// 設定モデル
export interface AgentConfig {
  server?: {
    port?: number
  }
  agent?: {
    name?: string
    description?: string
    systemPrompt?: string // システムプロンプト
  }
  subAgents?: SubAgentConfig[] // サブエージェント設定配列
  llm: {
    provider: 'openai' | 'bedrock'
    model: string
    apiKey?: string // OpenAI用
    baseUrl?: string // OpenAI互換サーバーのベースURL (LM Studioなど)
    region?: string // AWS Bedrock用
    accessKeyId?: string // AWS Bedrock用
    secretAccessKey?: string // AWS Bedrock用
    reasoning?: {
      effort?: 'minimal' | 'low' | 'medium' | 'high' // GPT-5用
    }
  }
  memory?: {
    enabled?: boolean // デフォルト: true
    path?: string // デフォルト: "file:./data/memory.db"
    vector?: {
      enabled?: boolean // デフォルト: false
    }
    embedding?: {
      provider: 'openai' | 'bedrock'
      model: string // デフォルト: "text-embedding-3-large"
      apiKey?: string // メインLLMとは別のキーを設定可能
      baseUrl?: string // OpenAI互換サーバーのベースURL
      region?: string // AWS Bedrock用
      accessKeyId?: string // AWS Bedrock用
      secretAccessKey?: string // AWS Bedrock用
    }
    workingMemory?: {
      enabled?: boolean // デフォルト: false
      // 将来のスキーマ定義用
    }
  }
  slack?: {
    enabled?: boolean
    botToken?: string
    appToken?: string
    signingSecret?: string
    channels?: string[]
  }
  logging: {
    level: string
    format: string
  }
}

// MCP設定
export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>
}

export interface MCPServerConfig {
  name?: string // サーバー名（MCPConfigから変換時に追加）
  type?: string
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
  autoApprove?: string[]
}
