# ReplaceMacros for VS Code

複数の文字列置換を1アクションで実行する VS Code 拡張機能です。置換のセットをマクロとして保存し、JSON でインポート/エクスポートできます。

## 機能
- 複数の文字列置換をまとめて実行 (選択範囲があれば範囲のみ、なければドキュメント全体)
- 置換セットをマクロとして保存・削除
- マクロを JSON 形式でインポート/エクスポート
- ステップの並べ替えやメモを付けて整理可能

## コマンド
- `Macros: Run Quick Multi Replace` (`vsc-macros.runQuickReplace`): その場で入力した置換ルールを1回だけ実行
- `Macros: Create Macro From Replacements` (`vsc-macros.createMacro`): 入力した置換ルールをマクロとして保存
- `Macros: Apply Saved Macro` (`vsc-macros.applyMacro`): 保存済みマクロを選んで適用（ツリーからのダブルクリックでも可）
- `Macros: Delete Saved Macro` (`vsc-macros.deleteMacro`): 保存済みマクロを削除（ツリーのコンテキストメニューにも表示）
- `Macros: Import Macros From JSON` (`vsc-macros.importMacros`): JSON からマクロをまとめて読み込み
- `Macros: Export Macros To JSON` (`vsc-macros.exportMacros`): 保存済みマクロを JSON に書き出し
- `Macros: Edit Saved Macro` (`vsc-macros.editMacro`): 保存済みマクロの名称・置換ルールを編集

## サイドバーの「Macros」ビュー
- アクティビティバーに追加される「Macros」アイコンから、保存済みマクロを一覧表示
- ツリーのアイテムをクリック/ダブルクリックで適用
- タイトルバーの + ボタンで新規作成、⋯ から import/export
- アイテムの右クリックから適用・編集・削除が可能

### マクロの作成/編集 UI
- ステップは Quick Pick で「追加→完了」するフロー。各ステップは選択して編集/削除できます。
- ステップ入力時に検索文字列・置換文字列・正規表現/大文字小文字の扱い・メモを対話的に指定できます。
- 置換後の `\n`/`\t` などをエスケープとして解釈するか、文字列のまま挿入するかを選べます（デフォルトは解釈する）。
- 並べ替えメニュー（↕️）で順序を上下に移動できます。

## 置換ルールの書式
どの入力欄も以下のいずれかの書式が使えます。

1. JSON 配列  
   `[{"find":"from","replace":"to"},{"find":"foo","replace":"bar","useRegex":true,"caseSensitive":false}]`

2. 行単位の簡易書式  
   ```
   foo => bar
   hello => world
   ```
   `useRegex`/`caseSensitive` が必要な場合は JSON 書式を使ってください。

## インポート/エクスポート形式
`import` は `[{ name, steps }...]` もしくは `{ "macros": [...] }` を受け付けます。`id` は省略可能です。

```json
[
  {
    "id": "abc123",
    "name": "example",
    "steps": [
      { "find": "foo", "replace": "bar" },
      { "find": "hoge", "replace": "fuga", "useRegex": true, "caseSensitive": false }
    ]
  }
]
```

## トラブルシュート
- コマンドが見つからない: VS Code ウィンドウを再読み込み（Cmd/Ctrl+Shift+P → Reload Window）。
- エディタが無い: コマンド実行時にファイルオープンダイアログを出します。

開発やビルド、配布手順については `DEVELOPMENT.md` を参照してください。
