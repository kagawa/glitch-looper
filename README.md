# GLITCH LOOPER

静止画像をブラウザ内でグリッチ加工し、シームレスなGIF・APNG・動画ループとして書き出すツールです。画像はサーバーへ送信されません。

## Local usage

`index.html` をブラウザで直接開いて使用できます。ローカルサーバーは不要です。

この要件を維持するため、JavaScriptはES Modulesではなく、読み込み順を明示した通常の `<script src>` を使用しています。

## Structure

- `index.html` — アプリのマークアップとスクリプト読み込み順
- `css/app.css` — アプリ全体のスタイル
- `js/config.js` — エフェクト定義、プリセット、パレット
- `js/state-ui.js` — 状態、Envelope、コントロールUI
- `js/codecs.js` — JPEG、PNG、WebP、GIFの実バイト破壊
- `js/base-effects.js` — ベース画像選択、VHS Wobble、Roll、Overscan、Bleed
- `js/pixel-effects.js` — Pixelate、Halftone、色調系ピクセル処理
- `js/analog-effects.js` — VHS、フィルム、ノイズ、Bloom
- `js/digital-effects.js` — Datamosh、Compression、Pixel Sort、Byte系処理
- `js/signal-effects.js` — Degauss、Ghosting、Sync、RF／Composite系処理
- `js/distort-effects.js` — Warp、Slice、Feedback Zoom、Melt、RGB Shift
- `js/screen-effects.js` — CRT、Region Mask、Zoom、HUD、最終合成
- `js/renderer.js` — Canvas共有資源と描画パイプライン
- `js/controls.js` — 画像読込、ランダム化、操作イベント
- `js/export.js` — GIF、APNG、MediaRecorder書き出し
- `js/share.js` — URL状態、クリップボード、共有
- `js/app.js` — アニメーション起動と初期化
- `effects.html` — 日英エフェクトリファレンス

各スクリプトは同じグローバルスコープを読み込み順に共有します。新しいファイルを追加するときは、利用する関数や状態を定義するファイルより後、呼び出し元より前に `index.html` へ追加してください。

## Checks

```sh
for file in js/*.js; do node --check "$file"; done
git diff --check
```

OGP画像は `npm run og` で再生成できます。

Random／Driftから守りたいエフェクトは、見出しの鍵を閉じます。Random設定内のPattern Seedは、空欄または`-1`で自動更新、0以上の整数でシミュレーション系エフェクトの破壊配置を固定します。`New Seed`は新しい固定Seedを生成します。Region Maskは固定矩形・移動矩形に加えて、暗部・中間調・明部・エッジ・ノイズを適用範囲にできます。

Preset欄の`＋`は現在の設定をブラウザ内へ名前付き保存し、`−`は選択中のユーザープリセットを削除します。保存対象はエフェクト設定、Pattern Seed、Lock、Sequencerで、入力画像は含みません。
