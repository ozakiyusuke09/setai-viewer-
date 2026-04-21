# CLAUDE.md — 世帯数ビューア全国版

## プロジェクト概要
ポスティング配布員向け、町丁目別の建て方別世帯数を閲覧するPWA。全国47都道府県対応。GitHub Pagesでホスティング。

## フォルダ構成
- CLAUDE.md … このファイル
- index.html … アプリ本体（HTML+CSS+JS単一ファイル）
- sw.js … Service Worker
- manifest.json … PWA設定
- data/index.json … 都道府県一覧（起動時読み込み）
- data/01.json〜47.json … 府県別町丁目データ（タップ時に遅延読み込み）
- tools/build-data.js … データ生成スクリプト（開発時のみ使用）

## 絶対守るルール
1. 作業指示に「実行しないで」とあれば絶対に実行しない
2. index.htmlは単一ファイル構成（HTML+CSS+JS全部入り）を維持
3. フレームワーク不使用、vanilla JS、var宣言スタイル
4. 外部ライブラリ不使用（Leaflet, topojson-client等は使わない）
8. 応答は最小限にする。変更したファイル名と行数だけ報告し、説明・要約・サマリーは出力しない
9. コードを読む際、ファイル全体をRead/catしない。必要な関数・セクションだけ読む
10. 大きなファイルの書き換えはEdit（部分置換）を使い、Write（全体書き換え）は避ける

## ビルドスクリプト仕様 (tools/build-data.js)

Node.js 18+, 依存: topojson-client (npm install topojson-client)

### 入力
TopoJSON: https://raw.githubusercontent.com/nyampire/jp_chome_boundary/master/TopoJSON/XX-name-all.topojson
e-Stat API appId: 61e89c03ae461dcfb60c7cfe0f235d92fcf4a111

### TopoJSONファイル名
01-hokkaido, 02-aomori, 03-iwate, 04-miyagi, 05-akita, 06-yamagata, 07-fukushima, 08-ibaraki, 09-tochigi, 10-gunma, 11-saitama, 12-chiba, 13-tokyo, 14-kanagawa, 15-niigata, 16-toyama, 17-ishikawa, 18-fukui, 19-yamanashi, 20-nagano, 21-gifu, 22-shizuoka, 23-aichi, 24-mie, 25-shiga, 26-kyoto, 27-oosaka, 28-hyogo, 29-nara, 30-wakayama, 31-tottori, 32-shimane, 33-okayama, 34-hiroshima, 35-yamaguchi, 36-tokushima, 37-kagawa, 38-ehime, 39-kouchi, 40-fukuoka, 41-saga, 42-nagasaki, 43-kumamoto, 44-ooita, 45-miyazaki, 46-kagoshima, 47-okinawa

### e-Statデータ取得
- getStatsList APIでstatsCode=00200521の小地域集計から各都道府県のstatsDataIdを動的取得
- 人口世帯テーブル: cat01=0010(人口), cat01=0040(世帯数), cat02=1
- 住宅建て方テーブル: cat01=0020(一戸建), cat01=0040(共同住宅)
- KEY_CODEマッチング: 11桁→10桁→9桁フォールバック
- setai=0かつjinko>0 → setai=Math.round(jinko/2.1)
- API呼び出し間200ms sleep

### 出力
data/index.json: {"prefectures":[{"code":"01","name":"北海道","areas":数},...],"generated":"日付"}
data/XX.json: [{"c":"コード","ct":"市","w":"区","m":"町丁目","s":世帯,"k":戸建,"ky":共同,"la":緯度,"lo":経度},...]
座標は小数5桁丸め。進捗はconsole.logで都道府県ごと表示。

## アプリ仕様 (index.html)

### 動作フロー
1. 起動 → data/index.json(15KB)読み込み → 47都道府県カード即表示
2. 都道府県タップ → data/XX.json を1本fetch → SWキャッシュ → 市区町村リスト
3. 市区町村タップ → 政令市なら区リスト、それ以外は町丁目リスト
4. 町丁目タップ → Googleマップ直リンク (https://www.google.com/maps/search/住所)

### データ管理
var areasByPref = {}; var loadedPrefs = {};

### 町丁目リスト
1行表示: 町名(flex:1) | 総世帯 | 戸建 | 集合 | 集合%
ヘッダー行あり

### 集合比率の色（ポスティング視点：集合多い＝効率良い＝緑）
- 80%以上 → 緑 var(--green)
- 50〜79% → 橙 var(--orange)
- 50%未満 → 赤 var(--red)
- setai=0 → グレー var(--text3)「-」表示

### 検索
読み込み済み府県内のみ。サジェスト最大30件。pendingScrollTo+ハイライト。

### UI
ダークネイビー(#0f172a)配色。都道府県カードはコンパクトグリッド、絵文字不要。スワイプ戻る/進む対応。safe-area対応。

### sw.js
CACHE_NAME: setai-viewer-v3
PRECACHE: index.html, manifest.json, data/index.json
data/XX.json: network-first-fallback-cache
