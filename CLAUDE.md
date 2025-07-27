# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要な指示

作業を開始する前に、必ず以下のファイルを読んで、プロジェクトの設計と要件を理解してください：
- `.kiro/specs/common-creation-agent/design.md` - システム設計書
- `.kiro/specs/common-creation-agent/requirements.md` - 要件定義書

## プロジェクト概要

Common Creation Agentは、voltagent.devプラットフォームを基盤とした汎用AIエージェントシステムです。LLMとの対話機能を核として、MCP（Model Context Protocol）による外部ツール連携、Slackゲートウェイを統合します。

## 開発コマンド

### 基本コマンド
```bash
# 開発サーバー起動（監視モード）
npm run dev

# TypeScriptビルド
npm run build

# テスト実行
npm test
npm run test:run  # CI用（監視なし）

# Lintチェック
npm run lint

# ビルド成果物削除
npm run clean

# 本番実行
npm start

# VoltAgentコマンド
npm run volt
```

### 単一テストの実行
```bash
# 特定のテストファイルを実行
npm test src/config/config-manager.test.ts

# ウォッチモードでテスト
npm test -- --watch
```

## アーキテクチャ概要

### ディレクトリ構造と責務

- `src/agent/` - コアエージェント機能
  - `agent-manager.ts` - VoltAgentとLLMプロバイダーの統合管理
  - `session-manager.ts` - 会話セッション管理
  - `types.ts` - エージェント関連の型定義

- `src/config/` - 設定管理
  - `config-manager.ts` - YAML設定ファイルの管理

- `src/core/` - 共通型定義とインターフェース
  - `types.ts` - システム全体の基本型
  - `interfaces.ts` - コンポーネント間のインターフェース

- `src/llm/` - LLMプロバイダー統合
  - `provider-manager.ts` - OpenAI/AWS Bedrockプロバイダー管理
  - `error-handler.ts` - レート制限とエラーハンドリング

### 技術スタック

- **フレームワーク**: VoltAgent (voltagent.dev)
- **言語**: TypeScript (ESM)
- **LLMプロバイダー**: OpenAI, AWS Bedrock
- **テストフレームワーク**: Vitest
- **ビルドツール**: TypeScript Compiler (tsc)
- **開発ツール**: tsx (TypeScript実行)
- **Node.js**: 22以上

### 主要な依存関係

- `@voltagent/core` - コアエージェント機能
- `@voltagent/vercel-ai` - AI SDK統合
- `@ai-sdk/openai` - OpenAI統合
- `@ai-sdk/amazon-bedrock` - AWS Bedrock統合
- `@slack/bolt` - Slack統合（実装予定）

## 設定管理

### 設定ファイル

すべての設定は`config/agent.yml`で管理されます：

```yaml
# サーバー設定
server:
  port: 3141

# エージェント設定
agent:
  name: "Common Creation Agent"
  systemPrompt: |
    あなたは汎用AIエージェントです。
    ユーザーの質問に対して適切で有益な回答を提供してください。

# LLM設定
llm:
  provider: "openai"  # または "bedrock"
  model: "gpt-4o-mini"
  
  # OpenAI用
  openai:
    apiKey: "your-api-key"
    # baseUrl: ""  # OpenAI互換サーバーのベースURL（オプション）
    # 例: LM Studioを使用する場合
    # baseUrl: "http://localhost:1234/v1"
    # 例: 他のOpenAI互換サーバーを使用する場合
    # baseUrl: "https://your-server.com/v1"
    # 空文字または未設定の場合は公式OpenAI APIを使用します
  
  # AWS Bedrock用
  bedrock:
    region: "us-east-1"
    accessKeyId: ""      # オプション（IAMロール使用時は不要）
    secretAccessKey: ""  # オプション（IAMロール使用時は不要）

# Slack設定
slack:
  enabled: false
  botToken: ""
  appToken: ""
  signingSecret: ""
```

- `config/mcp.json` - MCPサーバー設定（Model Context Protocol）

## エンドポイント

- `POST /api/agent` - エージェントとの対話
- `GET /health` - ヘルスチェック
- `GET /ui` - Swagger UI（http://localhost:3141/ui）

## 開発時の注意事項

1. **LLMプロバイダー切り替え**: `config/agent.yml`の`llm.provider`で OpenAI と AWS Bedrock を切り替え可能
2. **OpenAI互換サーバー対応**: `config/agent.yml`の`llm.openai.baseUrl`で LM Studio などのローカルLLMサーバーを利用可能
3. **セッション管理**: 各会話セッションはメモリ内で管理され、セッションIDで識別
4. **エラーハンドリング**: レート制限エラーは自動的に指数バックオフでリトライ
5. **MCP統合**: `config/mcp.json` で外部ツールを設定（実装予定）
6. **Slack統合**: `config/agent.yml`のSlack設定でボット機能を有効化（実装予定）

### OpenAI互換サーバーの使用方法

#### LM Studio の場合
1. LM Studio を起動し、ローカルサーバーを有効化（デフォルト: http://localhost:1234/v1）
2. `config/agent.yml` で以下のように設定：
```yaml
llm:
  provider: "openai"
  model: "your-model-name"  # LM Studioで読み込んだモデル名
  openai:
    apiKey: "not-required"  # LM Studioの場合はダミーでOK
    baseUrl: "http://localhost:1234/v1"
```

#### 他のOpenAI互換サーバーの場合
```yaml
llm:
  provider: "openai"
  model: "your-model-name"
  openai:
    apiKey: "your-api-key"
    baseUrl: "https://your-server.com/v1"
```

**注意**:
- `baseUrl` は http:// または https:// で始まる必要があります
- 末尾のスラッシュは自動的に除去されます
- `baseUrl` が未設定の場合は公式OpenAI APIが使用されます

## テスト戦略

- **単体テスト**: 各モジュールの個別機能をテスト
- **統合テスト**: LLMプロバイダーとの連携をモック化してテスト
- **カバレッジ目標**: 90%以上

## トラブルシューティング

### よくある問題

1. **OpenAI APIキーエラー**: `config/agent.yml`の`llm.openai.apiKey`にAPIキーを設定
2. **LM Studio接続エラー**:
   - LM Studioが起動しているか確認
   - `baseUrl` のポート番号が正しいか確認（デフォルト: 1234）
   - ファイアウォール設定を確認
3. **baseUrl形式エラー**: `baseUrl` が http:// または https:// で始まっているか確認
4. **AWS認証エラー**: `config/agent.yml`のBedrock設定またはAWS CLI/IAMロールで設定
5. **ポート競合**: `config/agent.yml`の`server.port`で別のポートを指定
6. **TypeScriptエラー**: `npm run build` でビルドエラーを確認

### デバッグ

```bash
# ログレベルをdebugに設定（config/agent.ymlのlogging.levelを"debug"に変更）
npm run dev
```