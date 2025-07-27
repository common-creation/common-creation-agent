/**
 * LLM Provider Integration Example
 * LLMプロバイダー統合の使用例
 */

import { Agent, Memory, AiSdkEmbeddingAdapter, InMemoryVectorAdapter } from '@voltagent/core'
import { LibSQLMemoryAdapter } from '@voltagent/libsql'
import { ConfigManagerImpl } from '../config/config-manager.js'
import { ModelFactoryImpl } from './provider-manager.js'
import type { ProviderConfig, EmbeddingConfig } from './types.js'

/**
 * VoltAgent 1.xでModelFactoryを使用する例
 */
async function example() {
  // 設定管理からLLM設定を取得
  const configManager = new ConfigManagerImpl()
  const agentConfig = await configManager.loadConfig()

  // モデルファクトリを初期化
  const modelFactory = new ModelFactoryImpl()

  // LLMプロバイダー設定
  const providerConfig: ProviderConfig = {
    provider: agentConfig.llm.provider,
    model: agentConfig.llm.model,
    apiKey: agentConfig.llm.apiKey,
    region: agentConfig.llm.region,
  }

  try {
    // 環境変数を設定
    modelFactory.setupEnvironment(providerConfig)

    // モデルを取得
    const model = modelFactory.getModel(providerConfig)

    // Memoryを初期化（オプション）
    let memory: Memory | undefined
    if (agentConfig.memory?.enabled) {
      const memoryPath = agentConfig.memory.path || 'file:./data/memory.db'
      const storage = new LibSQLMemoryAdapter({ url: memoryPath })

      // ベクトル検索とEmbeddingの設定（オプション）
      let embedding: any = undefined
      let vector: any = undefined

      if (agentConfig.memory.vector?.enabled && agentConfig.memory.embedding) {
        modelFactory.setupEnvironment(agentConfig.memory.embedding)
        const embeddingModel = modelFactory.getEmbeddingModel(agentConfig.memory.embedding)
        embedding = new AiSdkEmbeddingAdapter(embeddingModel)
        vector = new InMemoryVectorAdapter()
      }

      memory = new Memory({ storage, embedding, vector })
    }

    // VoltAgentのエージェントを作成
    const agent = new Agent({
      name: 'Common Creation Agent',
      instructions: `あなたは汎用AIアシスタントです。
ユーザーの質問に対して、親切で正確な回答を提供してください。
技術的な質問にも対応できます。`,
      model: model,
      memory: memory,
    })

    // テキスト生成の例
    console.log('=== Text Generation Example ===')
    const response = await agent.generateText(
      'TypeScriptの型システムについて簡単に説明してください。',
      { temperature: 0.7 }
    )
    console.log('Response:', response.text)

    // ストリーミングの例
    console.log('\n=== Streaming Example ===')
    const streamResponse = await agent.streamText('Node.jsの非同期処理について説明してください。', {
      temperature: 0.7,
    })

    for await (const chunk of streamResponse.textStream) {
      process.stdout.write(chunk)
    }
    console.log('\n')

    // プロバイダー切り替えの例
    console.log('\n=== Provider Switching Example ===')

    // Bedrockに切り替え（設定がある場合）
    if (process.env.AWS_REGION) {
      const bedrockConfig: ProviderConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: process.env.AWS_REGION,
      }

      modelFactory.setupEnvironment(bedrockConfig)
      const bedrockModel = modelFactory.getModel(bedrockConfig)

      const bedrockAgent = new Agent({
        name: 'Bedrock Agent',
        instructions: 'AWS Bedrockを使用したエージェントです。',
        model: bedrockModel,
        memory: memory,
      })

      const bedrockResponse = await bedrockAgent.generateText(
        'AWSの主要なサービスを3つ挙げてください。',
        { temperature: 0.7 }
      )
      console.log('Bedrock Response:', bedrockResponse.text)
    }
  } catch (error) {
    // エラーハンドリング
    if (error instanceof Error) {
      console.error('Error occurred:', error.message)

      // モデルファクトリでエラーを処理
      try {
        await modelFactory.handleError(error, providerConfig.provider)
      } catch (llmError) {
        console.error('LLM Error:', llmError)
      }
    }
  }
}

// エラーハンドリングとリトライの例
async function errorHandlingExample() {
  const modelFactory = new ModelFactoryImpl()
  const maxRetries = 3

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const config: ProviderConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY,
      }

      modelFactory.setupEnvironment(config)
      const model = modelFactory.getModel(config)

      const agent = new Agent({
        name: 'Retry Example Agent',
        instructions: 'リトライ機能のテスト用エージェント',
        model: model,
      })

      const response = await agent.generateText('Hello, how are you?', {
        temperature: 0.7,
      })
      console.log('Success:', response.text)
      break // 成功したらループを抜ける
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error)

      if (attempt < maxRetries - 1) {
        // 指数バックオフで待機
        const delay = 2 ** attempt * 1000
        console.log(`Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting LLM Provider Example...\n')
  example()
    .then(() => console.log('\nExample completed successfully!'))
    .catch((error) => console.error('Example failed:', error))
}
