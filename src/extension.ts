import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { Macro, MacroStep } from './types';
import { applySteps, macroSummary } from './logic';

const STATE_KEY = 'vscMacros.items';

class MacroStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  all(): Macro[] {
    return this.context.globalState.get<Macro[]>(STATE_KEY, []);
  }

  async save(macros: Macro[]): Promise<void> {
    await this.context.globalState.update(STATE_KEY, macros);
  }

  async add(macro: Macro): Promise<void> {
    const next = [...this.all(), macro];
    await this.save(next);
  }

  async update(target: Macro): Promise<void> {
    const next = this.all().map((item) => (item.id === target.id ? target : item));
    await this.save(next);
  }

  async remove(id: string): Promise<void> {
    const next = this.all().filter((item) => item.id !== id);
    await this.save(next);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const macroStore = new MacroStore(context);
  const treeProvider = new MacroTreeProvider(macroStore);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('vsc-macros.list', treeProvider));

  context.subscriptions.push(
    vscode.commands.registerCommand('vsc-macros.runQuickReplace', async () => {
      const editor = await getActiveEditorOrPrompt();
      if (!editor) {
        return;
      }

      const raw = await vscode.window.showInputBox({
        prompt: '置換ルールを入力 (JSON配列 or "before => after" の行で複数指定)',
        placeHolder:
          '[{"find":"from","replace":"to"},{"find":"a","replace":"b","useRegex":true,"caseSensitive":false}]',
        ignoreFocusOut: true
      });
      if (!raw) {
        return;
      }

      let steps: MacroStep[];
      try {
        steps = parseSteps(raw);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid input';
        vscode.window.showErrorMessage(`置換ルールの読み込みに失敗しました: ${message}`);
        return;
      }
      if (!steps.length) {
        vscode.window.showWarningMessage('置換ルールがありません。');
        return;
      }

      await applyStepsToEditor(editor, steps);
    }),

    vscode.commands.registerCommand('vsc-macros.createMacro', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'マクロ名を入力',
        ignoreFocusOut: true
      });
      if (!name) {
        return;
      }

      const steps = await collectSteps();
      if (!steps) {
        return;
      }
      if (!steps.length) {
        vscode.window.showWarningMessage('ステップがありません。');
        return;
      }

      const macro: Macro = {
        id: generateId(),
        name,
        steps
      };
      await macroStore.add(macro);
      treeProvider.refresh();
      vscode.window.showInformationMessage(`マクロ "${macro.name}" を保存しました。`);
    }),

    vscode.commands.registerCommand('vsc-macros.applyMacro', async (macroArg?: Macro | MacroTreeItem) => {
      const macros = macroStore.all();
      if (!macros.length) {
        vscode.window.showInformationMessage('保存済みマクロがありません。先にマクロを作成してください。');
        return;
      }
      const direct = extractMacroArg(macroArg);
      const target = direct ?? (await pickMacro(macros));
      if (!target) {
        return;
      }
      const editor = await getActiveEditorOrPrompt();
      if (!editor) {
        return;
      }
      await applyStepsToEditor(editor, target.steps, target.name);
    }),

    vscode.commands.registerCommand('vsc-macros.deleteMacro', async (macroArg?: Macro | MacroTreeItem) => {
      const macros = macroStore.all();
      if (!macros.length) {
        vscode.window.showInformationMessage('削除できるマクロがありません。');
        return;
      }
      const direct = extractMacroArg(macroArg);
      const target = direct ?? (await pickMacro(macros));
      if (!target) {
        return;
      }
      await macroStore.remove(target.id);
      treeProvider.refresh();
      vscode.window.showInformationMessage(`マクロ "${target.name}" を削除しました。`);
    }),

    vscode.commands.registerCommand('vsc-macros.editMacro', async (item?: Macro | MacroTreeItem) => {
      const macros = macroStore.all();
      if (!macros.length) {
        vscode.window.showInformationMessage('編集できるマクロがありません。');
        return;
      }

      const direct = extractMacroArg(item);
      const target = direct ?? (await pickMacro(macros));
      if (!target) {
        return;
      }

      const newName = await vscode.window.showInputBox({
        prompt: 'マクロ名を編集',
        value: target.name,
        ignoreFocusOut: true
      });
      if (!newName) {
        return;
      }

      const updatedSteps = await collectSteps(target.steps);
      if (!updatedSteps) {
        return;
      }
      if (!updatedSteps.length) {
        vscode.window.showWarningMessage('ステップがありません。');
        return;
      }

      await macroStore.update({
        id: target.id,
        name: newName,
        steps: updatedSteps
      });
      treeProvider.refresh();
      vscode.window.showInformationMessage(`マクロ "${newName}" を更新しました。`);
    }),

    vscode.commands.registerCommand('vsc-macros.importMacros', async () => {
      const uri = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ['json'] }
      });
      if (!uri || !uri[0]) {
        return;
      }
      try {
        const content = await fs.readFile(uri[0].fsPath, 'utf8');
        const parsed = JSON.parse(content);
        const imported = Array.isArray(parsed) ? parsed : parsed.macros;
        if (!Array.isArray(imported)) {
          throw new Error('Invalid file format');
        }
        const normalized = imported
          .map((item) => normalizeMacro(item))
          .filter((item): item is Macro => Boolean(item));
        if (!normalized.length) {
          vscode.window.showWarningMessage('有効なマクロが見つかりませんでした。');
          return;
        }
        await macroStore.save(normalized);
        treeProvider.refresh();
        vscode.window.showInformationMessage(`マクロを ${normalized.length} 件インポートしました。`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`インポートに失敗しました: ${message}`);
      }
    }),

    vscode.commands.registerCommand('vsc-macros.exportMacros', async () => {
      const macros = macroStore.all();
      if (!macros.length) {
        vscode.window.showInformationMessage('保存済みマクロがありません。');
        return;
      }
      const target = await vscode.window.showSaveDialog({
        filters: { JSON: ['json'] },
        defaultUri: vscode.Uri.file('macros.json')
      });
      if (!target) {
        return;
      }
      try {
        await fs.writeFile(target.fsPath, JSON.stringify(macros, null, 2), 'utf8');
        vscode.window.showInformationMessage(`マクロを ${target.fsPath} に保存しました。`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`エクスポートに失敗しました: ${message}`);
      }
    })
  );
}

export function deactivate(): void {
  // no-op
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMacro(raw: unknown): Macro | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const data = raw as Partial<Macro>;
  if (!data.name || !Array.isArray(data.steps)) {
    return undefined;
  }
  const steps = data.steps
    .map((step) => normalizeStep(step))
    .filter((step): step is MacroStep => Boolean(step));
  if (!steps.length) {
    return undefined;
  }
  return {
    id: data.id ?? generateId(),
    name: data.name,
    steps
  };
}

function normalizeStep(raw: unknown): MacroStep | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const data = raw as Partial<MacroStep>;
  if (typeof data.find !== 'string' || typeof data.replace !== 'string') {
    return undefined;
  }
  return {
    find: data.find,
    replace: data.replace,
    useRegex: Boolean(data.useRegex),
    caseSensitive: Boolean(data.caseSensitive),
    interpretEscapes: data.interpretEscapes !== false,
    note: typeof data.note === 'string' ? data.note : undefined
  };
}

function parseSteps(raw: string): MacroStep[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const steps = parsed
        .map((item) => normalizeStep(item))
        .filter((item): item is MacroStep => Boolean(item));
      return steps;
    }
  } catch {
    // fall back to line parsing
  }

  const steps: MacroStep[] = [];
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const content = line.trim();
    if (!content) {
      continue;
    }
    const [find, replace] = content.split(/\s*=>\s*/);
    if (replace === undefined) {
      throw new Error('行ごとの書式は "before => after" で入力してください。');
    }
    steps.push({ find, replace, useRegex: false, caseSensitive: false });
  }
  return steps;
}

async function collectSteps(initialSteps: MacroStep[] = []): Promise<MacroStep[] | undefined> {
  let steps = [...initialSteps];
  while (true) {
  const items: StepQuickPickItem[] = [
    ...steps.map(
      (step, index): StepQuickPickItem => ({
        label: `${index + 1}. ${step.find} -> ${step.replace}`,
        description: describeStep(step),
        action: 'edit',
        index
      })
    ),
    ...steps.map(
      (step, index): StepQuickPickItem => ({
        label: `↕️ 並べ替え: ${index + 1}. ${step.find}`,
        description: '順序を変更',
        action: 'reorder',
        index
      })
    ),
    { label: '➕ ステップを追加', action: 'add' } as StepQuickPickItem,
    {
      label: '✅ 完了',
      description: steps.length ? `${steps.length} step` : 'ステップなし',
      action: 'done'
    } as StepQuickPickItem
  ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'マクロのステップを追加/編集/削除'
    });
    if (!picked) {
      return undefined;
    }

    if (picked.action === 'done') {
      if (!steps.length) {
        vscode.window.showWarningMessage('ステップがありません。');
        continue;
      }
      return steps;
    }

    if (picked.action === 'add') {
      const newStep = await promptForStep();
      if (newStep) {
        steps.push(newStep);
      }
      continue;
    }

    if (picked.action === 'edit' && picked.index !== undefined) {
      const op = await vscode.window.showQuickPick<StepEditAction>(
        [
          { label: '✏️ 編集', action: 'edit' },
          { label: '🗑 削除', action: 'delete' },
          { label: '↩︎ キャンセル', action: 'cancel' }
        ],
        { placeHolder: `ステップ ${picked.index + 1} を編集/削除` }
      );
      if (!op || op.action === 'cancel') {
        continue;
      }
      if (op.action === 'delete') {
        steps.splice(picked.index, 1);
        continue;
      }
      const updated = await promptForStep(steps[picked.index]);
      if (updated) {
        steps[picked.index] = updated;
      }
      continue;
    }

    if (picked.action === 'reorder' && picked.index !== undefined) {
      const direction = await vscode.window.showQuickPick(
        [
          { label: '⬆️ 上へ', value: -1 },
          { label: '⬇️ 下へ', value: 1 },
          { label: '↩︎ キャンセル', value: 0 }
        ],
        { placeHolder: `ステップ ${picked.index + 1} の位置を変更` }
      );
      if (!direction || direction.value === 0) {
        continue;
      }
      const newIndex = picked.index + direction.value;
      if (newIndex < 0 || newIndex >= steps.length) {
        vscode.window.showInformationMessage('これ以上移動できません。');
        continue;
      }
      const [moved] = steps.splice(picked.index, 1);
      steps.splice(newIndex, 0, moved);
    }
  }
}

type StepQuickPickItem =
  | (vscode.QuickPickItem & { action: 'add' | 'done' })
  | (vscode.QuickPickItem & { action: 'edit'; index: number })
  | (vscode.QuickPickItem & { action: 'reorder'; index: number });

type StepEditAction = vscode.QuickPickItem & { action: 'edit' | 'delete' | 'cancel' };

async function promptForStep(existing?: MacroStep): Promise<MacroStep | undefined> {
  const find = await vscode.window.showInputBox({
    prompt: '検索文字列 (find)',
    value: existing?.find ?? '',
    ignoreFocusOut: true
  });
  if (find === undefined) {
    return undefined;
  }

  const replace = await vscode.window.showInputBox({
    prompt: '置換後文字列 (replace)',
    value: existing?.replace ?? '',
    ignoreFocusOut: true
  });
  if (replace === undefined) {
    return undefined;
  }

  type BoolPick = { label: string; value: boolean; picked?: boolean };
  const useRegexPick = await vscode.window.showQuickPick<BoolPick>(
    [
      { label: '通常の文字列として検索', value: false, picked: !existing?.useRegex },
      { label: '正規表現として検索', value: true, picked: !!existing?.useRegex }
    ],
    { placeHolder: '検索方法を選択' }
  );
  if (!useRegexPick) {
    return undefined;
  }

  const casePick = await vscode.window.showQuickPick<BoolPick>(
    [
      { label: '大文字小文字を区別する', value: true, picked: !!existing?.caseSensitive },
      { label: '大文字小文字を区別しない', value: false, picked: !existing?.caseSensitive }
    ],
    { placeHolder: '大文字小文字の扱いを選択' }
  );
  if (!casePick) {
    return undefined;
  }

  const interpretPick = await vscode.window.showQuickPick<BoolPick>(
    [
      { label: '置換後の \\n, \\t を解釈する', value: true, picked: existing?.interpretEscapes !== false },
      { label: '解釈しない（そのまま文字列を挿入）', value: false, picked: existing?.interpretEscapes === false }
    ],
    { placeHolder: '置換後文字列のエスケープ解釈' }
  );
  if (!interpretPick) {
    return undefined;
  }

  const note = await vscode.window.showInputBox({
    prompt: 'メモ (任意)',
    value: existing?.note ?? '',
    ignoreFocusOut: true,
    placeHolder: '置換の意図メモなど'
  });
  if (note === undefined) {
    return undefined;
  }

  return {
    find,
    replace,
    useRegex: useRegexPick.value,
    caseSensitive: casePick.value,
    interpretEscapes: interpretPick.value,
    note: note || undefined
  };
}

function describeStep(step: MacroStep): string {
  const mode = step.useRegex ? 'regex' : 'text';
  const caseFlag = step.caseSensitive ? 'case' : 'ignore case';
  const esc = step.interpretEscapes === false ? ', \\保持' : '';
  const memo = step.note ? `, ${step.note}` : '';
  return `${mode}, ${caseFlag}${esc}${memo}`;
}

function extractMacroArg(arg?: Macro | MacroTreeItem): Macro | undefined {
  if (!arg) {
    return undefined;
  }
  if ('macro' in arg) {
    return arg.macro;
  }
  return arg;
}

async function pickMacro(macros: Macro[]): Promise<Macro | undefined> {
  const picked = await vscode.window.showQuickPick(
    macros.map((item) => ({
      label: item.name,
      description: macroSummary(item.steps),
      id: item.id
    })),
    { placeHolder: 'マクロを選択' }
  );
  if (!picked) {
    return undefined;
  }
  return macros.find((item) => item.id === picked.id);
}

async function applyStepsToEditor(
  editor: vscode.TextEditor,
  steps: MacroStep[],
  label?: string
): Promise<void> {
  const document = editor.document;
  const selections = editor.selections.filter((sel) => !sel.isEmpty);
  const ranges = selections.length
    ? selections
    : [new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))];

  await editor.edit((editBuilder) => {
    for (const range of ranges) {
      const original = document.getText(range);
      const replaced = applySteps(original, steps);
      editBuilder.replace(range, replaced);
    }
  });

  const name = label ?? 'マクロ';
  vscode.window.showInformationMessage(`${name} を適用しました (${steps.length} step)。`);
}

class MacroTreeProvider implements vscode.TreeDataProvider<MacroTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MacroTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: MacroStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MacroTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MacroTreeItem): MacroTreeItem[] {
    if (element) {
      return [];
    }
    const macros = this.store.all();
    if (!macros.length) {
      return [];
    }
    return macros.map((macro) => new MacroTreeItem(macro));
  }
}

class MacroTreeItem extends vscode.TreeItem {
  constructor(readonly macro: Macro) {
    super(macro.name, vscode.TreeItemCollapsibleState.None);
    this.description = macroSummary(macro.steps);
    this.contextValue = 'macroItem';
    this.command = {
      command: 'vsc-macros.applyMacro',
      title: 'Apply Macro',
      arguments: [macro]
    };
    this.tooltip = macro.steps
      .map(
        (step, i) =>
          `${i + 1}. ${step.useRegex ? '/' : ''}${step.find}${step.useRegex ? '/' : ''} -> ${
            step.replace
          }${step.note ? ` (${step.note})` : ''}`
      )
      .join('\n');
  }
}

async function getActiveEditorOrPrompt(): Promise<vscode.TextEditor | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    return editor;
  }
  const choice = await vscode.window.showInformationMessage('アクティブなエディタがありません。', 'ファイルを開く');
  if (choice === 'ファイルを開く') {
    await vscode.commands.executeCommand('workbench.action.files.openFile');
  }
  return vscode.window.activeTextEditor ?? undefined;
}
