/**
 * Zod JSON Schema Generator Monkeypatch
 *
 * VoltAgentが使用するZodのJSON Schema変換処理で、
 * カスタム型に遭遇した際にエラーをスローしないように修正します。
 *
 * 問題：
 * - Zod v4の JSONSchemaGenerator は unrepresentable のデフォルト値が "throw"
 * - カスタム型（z.custom()）に遭遇すると "Custom types cannot be represented in JSON Schema" エラーをスロー
 *
 * 解決策：
 * - 動的にzod/v4/coreをインポートして、JSONSchemaGenerator.prototypeをパッチ
 * - process メソッドをラップして、custom型のエラーを回避
 */

/**
 * Zodのプロトタイプをパッチする関数
 */
export async function patchZodJsonSchemaGenerator(): Promise<void> {
  try {
    // zod/v4/coreを動的にインポート
    const zodCore = await import('zod/v4/core')

    // JSONSchemaGeneratorが存在するか確認
    if (!zodCore.JSONSchemaGenerator) {
      // eslint-disable-next-line no-console
      console.warn('[Monkeypatch] JSONSchemaGenerator not found in zod/v4/core')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSONSchemaGenerator = zodCore.JSONSchemaGenerator as any

    // 既にパッチ済みかチェック
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (JSONSchemaGenerator.prototype._monkeypatched) {
      // eslint-disable-next-line no-console
      console.info('[Monkeypatch] JSONSchemaGenerator already patched, skipping')
      return
    }

    // 元のprocessメソッドを保存
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const originalProcess = JSONSchemaGenerator.prototype.process

    // processメソッドをパッチ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    JSONSchemaGenerator.prototype.process = function (this: any, schema: any, path: string[]): any {
      // unrepresentableを一時的に"ignore"に変更してエラーを回避
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const originalUnrepresentable = this.unrepresentable
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.unrepresentable = 'ignore'

      try {
        // 元のメソッドを呼び出す
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return originalProcess.call(this, schema, path)
      } finally {
        // unrepresentableを元に戻す
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.unrepresentable = originalUnrepresentable
      }
    }

    // パッチ済みフラグを設定
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    JSONSchemaGenerator.prototype._monkeypatched = true

    // eslint-disable-next-line no-console
    console.info('[Monkeypatch] Zod JSONSchemaGenerator.prototype.process successfully patched')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Monkeypatch] Failed to patch Zod JSONSchemaGenerator:', error)
  }
}

// パッチを即座に適用
await patchZodJsonSchemaGenerator();
