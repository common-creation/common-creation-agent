# Node.js 22 Alpine イメージを使用
FROM node:22-alpine

# Python、uv、その他必要なパッケージをインストール
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    bash \
    git \
    docker \
    && ln -sf python3 /usr/bin/python

# 作業ディレクトリを設定
WORKDIR /app

# パッケージファイルをコピー
COPY package*.json ./

# 依存関係をインストール（開発依存関係も含む）
RUN npm ci

# uvをrootユーザーでインストール
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
# uvは通常 ~/.local/bin にインストールされる
ENV PATH="/root/.local/bin:$PATH"

# インストール後にuvとuvxが利用可能か確認
RUN uv --version && uvx --version

# ソースコードをコピー
COPY . .

# rootユーザーのままでDockerコマンドを使用可能にする
# （Dockerソケットマウント時にrootアクセスが必要）

# ポート3141を公開
EXPOSE 3141

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3141/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# 起動
CMD ["npm", "run", "start"]