# CHANGELOG.md — 更新履歴

## v2.0 — 2026-04-20 UI改善・高速化・検索スクロール対応
### 改善① 町丁目リスト1行表示
- .town-row を flex 1行レイアウトに変更（高さ44px）
- ヘッダー行追加（町丁目 / 総世帯 / 戸建 / 集合 / 集合%）
- 集合比率を色分け表示（緑<50% / 橙50-79% / 赤80%+）
- 旧カードスタイル（.town-stats/.town-stat）を廃止
### 改善② 初期読み込み高速化
- ローディング画面にプログレスバーと段階ステータス追加
- TopoJSON (0-4/12) → e-Stat (4-12/12) の進捗表示
- sw.js CACHE_NAME を v2 に更新（旧キャッシュ自動削除）
- sw.js PRECACHE に4府県TopoJSON URLを追加（2回目以降SW配信）
### 改善③ 検索→該当丁目スクロール＋ハイライト
- pendingScrollTo グローバル変数追加
- selectSuggest() でpendingScrollToをセットしてからtownViewへ遷移
- showTownView() 末尾でtownRowにdata-area-idx属性付与、scrollIntoView
- @keyframes highlight アニメーション追加（accentカラー1.5秒フェード）
### その他
- Service Worker登録コード追加（navigator.serviceWorker.register）

## v1.0 — 初版作成
- プロジェクト開始
- CLAUDE.md / CHANGELOG.md / SESSION_LOG.md / backup/ を作成
