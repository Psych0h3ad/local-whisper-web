# Local Whisper Web

インストールもログインも不要な、ブラウザ完結の音声文字起こしツールです。音声ファイルと文字起こし結果はサーバーへ送信せず、端末内の Whisper で処理します。

> このプロジェクトは TTS（文字→音声）ではなく、STT / ASR（音声→文字）です。

[English README](README.en.md)

## できること

- 90秒以内・25 MB以内の音声を文字起こし
- 日本語、英語、中国語を明示選択
- WebGPU が使える Chrome / Edge では GPU を優先
- WebGPU が使えない環境では WASM / CPU へフォールバック
- 結果を編集、コピー、BOM付き UTF-8 TXT、JSONで保存
- 標準モデル（Whisper base）と軽量モデル（Whisper tiny）を切り替え
- モデルキャッシュを画面から削除

音声のアップロード、ユーザー登録、解析タグ、クラウド保存はありません。

## データの流れ

```text
音声ファイル
  → ブラウザの AudioContext で 16 kHz / mono に変換
  → Web Worker 内の Whisper (ONNX Runtime Web) で推論
  → 文字起こし結果を画面に返す
```

音声と結果はメモリ上だけで扱い、ブラウザストレージには保存しません。初回のみ Hugging Face からモデルを取得し、モデルファイルはブラウザの Cache API に保存されることがあります。モデル取得は `huggingface.co` から Hugging Face の CDN（現在は `*.cdn.hf.co` 等）へリダイレクトされる場合があります。社内プロキシではリダイレクト先を含む許可が必要です。

サイトのホスティング/CDN事業者は、ページやアセットの配信時にIPアドレス、User-Agent、リクエストURL、時刻など通常のアクセスメタデータを処理・記録する場合があります。音声データと文字起こし結果はその通信に含まれません。アプリの解析タグと Workers Observability は無効です。

「コピー」を押すと、結果はブラウザの外にあるOSのクリップボードへ渡ります。その後はOS、クリップボード履歴・同期、DLP製品、リモートデスクトップ等の管理範囲です。TXT/JSONも明示的に保存した後は通常のローカルファイルとして扱われます。詳細は [PRIVACY.md](PRIVACY.md) を参照してください。

## 初回ダウンロード

モデル重み、Tokenizer等の概算です。ブラウザやキャッシュ状態により多少変わります。

| モデル | CPU / WASM | GPU / WebGPU | 向いている用途 |
| --- | ---: | ---: | --- |
| Whisper base | 約80 MB | 約209 MB | 日本語の精度を優先 |
| Whisper tiny | 約44 MB | 約123 MB | 低スペックPC、速度優先 |

ONNX Runtime の WASM（約22 MB）とアプリ本体は、このサイトと同じ配信元から提供します。モデル取得だけは `huggingface.co` と、そのリダイレクト先である Hugging Face CDN への接続が必要です。

## 対応環境

- 推奨: 最新版 Chrome / Edge（Windows、macOS）
- Firefox / Safari: WASM / CPU で動作する設計ですが、処理速度や音声コーデックの対応は環境依存です
- 正式な入力形式: WAV、MP3
- M4A、AAC、WebM、OGG: ブラウザがそのコーデックをデコードできる場合に利用可能

会社PCでは WebGPU、Web Worker、WebAssembly、`huggingface.co` への通信、ブラウザキャッシュが組織ポリシーで制限される場合があります。「インストール不要」と「社内規定上利用可能」は別なので、利用前に所属組織のルールを確認してください。

## 開発

必要なもの:

- Node.js 22.13 以上
- npm

```bash
npm ci
npm run dev
```

通常は `http://localhost:3000` で起動します。

検証:

```bash
npm test
```

`npm test` は型チェック、Lint、本番ビルド、サーバーレンダリングと公開物の契約テストを実行します。

`package-lock.json` に固定された本番・開発・推移的・任意依存を含む完全な CycloneDX SBOM は次で生成できます。出力は `artifacts/local-whisper-web.cdx.json` です。

```bash
npm run sbom
```

別の出力先を使う場合は `npm run sbom -- path/to/sbom.cdx.json` と指定できます。生成スクリプトはルート名と全ての直接依存を検証し、Next.js、React、React DOM、Transformers.jsの欠落があれば失敗します。

## 技術構成

- React / Next.js互換 App Router (`vinext`)
- `@huggingface/transformers` 3.8.1
- ONNX Runtime Web
- Module Web Worker
- WebGPU + WASM fallback
- Cloudflare Workers互換の静的配信

Transformers.js は `3.8.1` に完全固定しています。4.x の WASM q8 経路では、検証時点で Whisper のセッション生成または約60秒音声の出力品質に問題があったためです。依存更新は GPU / CPU の両経路で実音声を再検証してから行ってください。

## 固定しているモデル

| 用途 | Model ID | Revision |
| --- | --- | --- |
| 標準 | `onnx-community/whisper-base` | `1846881b6b3a3024392c1eea3ad983695bc23925` |
| 軽量 | `onnx-community/whisper-tiny` | `ff4177021cc41f7db950912b73ea4fdf7d01d8e7` |

モデル本体はこのリポジトリに含めず、実行時に Hugging Face から取得します。

## 既知の制約

- 音声認識には誤認識や、音声に存在しない語を生成する「幻覚」があります
- 話者分離、マイク録音、リアルタイム文字起こし、翻訳は未対応です
- v0.1では字幕用タイムスタンプを出しません
- 初回モデル取得が社内プロキシで止められる場合があります
- WASMは端末性能や組織ポリシーの影響を受け、GPUより時間がかかります
- 録音対象者の同意、機密情報、個人情報、社内ルールの確認は利用者の責任です

医療、法務、人事、安全管理など、高リスクな判断の唯一の根拠には使わないでください。

## コントリビュート

[CONTRIBUTING.md](CONTRIBUTING.md) を読んでから Issue / Pull Request を送ってください。バグ報告に機密音声や個人情報を添付しないでください。

## ライセンス

アプリケーションコードは [MIT License](LICENSE) です。モデルと依存ライブラリには別のライセンスが適用されます。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と、配信成果物にも含める[主要ライセンス本文](public/third-party-licenses/README.txt)を参照してください。
