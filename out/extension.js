"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs_1 = require("fs");
const logic_1 = require("./logic");
const STATE_KEY = 'vscMacros.items';
class MacroStore {
    constructor(context) {
        this.context = context;
    }
    all() {
        return this.context.globalState.get(STATE_KEY, []);
    }
    async save(macros) {
        await this.context.globalState.update(STATE_KEY, macros);
    }
    async add(macro) {
        const next = [...this.all(), macro];
        await this.save(next);
    }
    async update(target) {
        const next = this.all().map((item) => (item.id === target.id ? target : item));
        await this.save(next);
    }
    async remove(id) {
        const next = this.all().filter((item) => item.id !== id);
        await this.save(next);
    }
}
function activate(context) {
    const macroStore = new MacroStore(context);
    const treeProvider = new MacroTreeProvider(macroStore);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('vsc-macros.list', treeProvider));
    context.subscriptions.push(vscode.commands.registerCommand('vsc-macros.runQuickReplace', async () => {
        const editor = await getActiveEditorOrPrompt();
        if (!editor) {
            return;
        }
        const raw = await vscode.window.showInputBox({
            prompt: '置換ルールを入力 (JSON配列 or "before => after" の行で複数指定)',
            placeHolder: '[{"find":"from","replace":"to"},{"find":"a","replace":"b","useRegex":true,"caseSensitive":false}]',
            ignoreFocusOut: true
        });
        if (!raw) {
            return;
        }
        let steps;
        try {
            steps = parseSteps(raw);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid input';
            vscode.window.showErrorMessage(`置換ルールの読み込みに失敗しました: ${message}`);
            return;
        }
        if (!steps.length) {
            vscode.window.showWarningMessage('置換ルールがありません。');
            return;
        }
        await applyStepsToEditor(editor, steps);
    }), vscode.commands.registerCommand('vsc-macros.createMacro', async () => {
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
        const macro = {
            id: generateId(),
            name,
            steps
        };
        await macroStore.add(macro);
        treeProvider.refresh();
        vscode.window.showInformationMessage(`マクロ "${macro.name}" を保存しました。`);
    }), vscode.commands.registerCommand('vsc-macros.applyMacro', async (macroArg) => {
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
    }), vscode.commands.registerCommand('vsc-macros.deleteMacro', async (macroArg) => {
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
    }), vscode.commands.registerCommand('vsc-macros.editMacro', async (item) => {
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
    }), vscode.commands.registerCommand('vsc-macros.importMacros', async () => {
        const uri = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { JSON: ['json'] }
        });
        if (!uri || !uri[0]) {
            return;
        }
        try {
            const content = await fs_1.promises.readFile(uri[0].fsPath, 'utf8');
            const parsed = JSON.parse(content);
            const imported = Array.isArray(parsed) ? parsed : parsed.macros;
            if (!Array.isArray(imported)) {
                throw new Error('Invalid file format');
            }
            const normalized = imported
                .map((item) => normalizeMacro(item))
                .filter((item) => Boolean(item));
            if (!normalized.length) {
                vscode.window.showWarningMessage('有効なマクロが見つかりませんでした。');
                return;
            }
            await macroStore.save(normalized);
            treeProvider.refresh();
            vscode.window.showInformationMessage(`マクロを ${normalized.length} 件インポートしました。`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`インポートに失敗しました: ${message}`);
        }
    }), vscode.commands.registerCommand('vsc-macros.exportMacros', async () => {
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
            await fs_1.promises.writeFile(target.fsPath, JSON.stringify(macros, null, 2), 'utf8');
            vscode.window.showInformationMessage(`マクロを ${target.fsPath} に保存しました。`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`エクスポートに失敗しました: ${message}`);
        }
    }));
}
function deactivate() {
    // no-op
}
function generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeMacro(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const data = raw;
    if (!data.name || !Array.isArray(data.steps)) {
        return undefined;
    }
    const steps = data.steps
        .map((step) => normalizeStep(step))
        .filter((step) => Boolean(step));
    if (!steps.length) {
        return undefined;
    }
    return {
        id: data.id ?? generateId(),
        name: data.name,
        steps
    };
}
function normalizeStep(raw) {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const data = raw;
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
function parseSteps(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return [];
    }
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            const steps = parsed
                .map((item) => normalizeStep(item))
                .filter((item) => Boolean(item));
            return steps;
        }
    }
    catch {
        // fall back to line parsing
    }
    const steps = [];
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
async function collectSteps(initialSteps = []) {
    let steps = [...initialSteps];
    while (true) {
        const items = [
            ...steps.map((step, index) => ({
                label: `${index + 1}. ${step.find} -> ${step.replace}`,
                description: describeStep(step),
                action: 'edit',
                index
            })),
            ...steps.map((step, index) => ({
                label: `↕️ 並べ替え: ${index + 1}. ${step.find}`,
                description: '順序を変更',
                action: 'reorder',
                index
            })),
            { label: '➕ ステップを追加', action: 'add' },
            {
                label: '✅ 完了',
                description: steps.length ? `${steps.length} step` : 'ステップなし',
                action: 'done'
            }
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
            const op = await vscode.window.showQuickPick([
                { label: '✏️ 編集', action: 'edit' },
                { label: '🗑 削除', action: 'delete' },
                { label: '↩︎ キャンセル', action: 'cancel' }
            ], { placeHolder: `ステップ ${picked.index + 1} を編集/削除` });
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
            const direction = await vscode.window.showQuickPick([
                { label: '⬆️ 上へ', value: -1 },
                { label: '⬇️ 下へ', value: 1 },
                { label: '↩︎ キャンセル', value: 0 }
            ], { placeHolder: `ステップ ${picked.index + 1} の位置を変更` });
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
async function promptForStep(existing) {
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
    const useRegexPick = await vscode.window.showQuickPick([
        { label: '通常の文字列として検索', value: false, picked: !existing?.useRegex },
        { label: '正規表現として検索', value: true, picked: !!existing?.useRegex }
    ], { placeHolder: '検索方法を選択' });
    if (!useRegexPick) {
        return undefined;
    }
    const casePick = await vscode.window.showQuickPick([
        { label: '大文字小文字を区別する', value: true, picked: !!existing?.caseSensitive },
        { label: '大文字小文字を区別しない', value: false, picked: !existing?.caseSensitive }
    ], { placeHolder: '大文字小文字の扱いを選択' });
    if (!casePick) {
        return undefined;
    }
    const interpretPick = await vscode.window.showQuickPick([
        { label: '置換後の \\n, \\t を解釈する', value: true, picked: existing?.interpretEscapes !== false },
        { label: '解釈しない（そのまま文字列を挿入）', value: false, picked: existing?.interpretEscapes === false }
    ], { placeHolder: '置換後文字列のエスケープ解釈' });
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
function describeStep(step) {
    const mode = step.useRegex ? 'regex' : 'text';
    const caseFlag = step.caseSensitive ? 'case' : 'ignore case';
    const esc = step.interpretEscapes === false ? ', \\保持' : '';
    const memo = step.note ? `, ${step.note}` : '';
    return `${mode}, ${caseFlag}${esc}${memo}`;
}
function extractMacroArg(arg) {
    if (!arg) {
        return undefined;
    }
    if ('macro' in arg) {
        return arg.macro;
    }
    return arg;
}
async function pickMacro(macros) {
    const picked = await vscode.window.showQuickPick(macros.map((item) => ({
        label: item.name,
        description: (0, logic_1.macroSummary)(item.steps),
        id: item.id
    })), { placeHolder: 'マクロを選択' });
    if (!picked) {
        return undefined;
    }
    return macros.find((item) => item.id === picked.id);
}
async function applyStepsToEditor(editor, steps, label) {
    const document = editor.document;
    const selections = editor.selections.filter((sel) => !sel.isEmpty);
    const ranges = selections.length
        ? selections
        : [new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))];
    await editor.edit((editBuilder) => {
        for (const range of ranges) {
            const original = document.getText(range);
            const replaced = (0, logic_1.applySteps)(original, steps);
            editBuilder.replace(range, replaced);
        }
    });
    const name = label ?? 'マクロ';
    vscode.window.showInformationMessage(`${name} を適用しました (${steps.length} step)。`);
}
class MacroTreeProvider {
    constructor(store) {
        this.store = store;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
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
    constructor(macro) {
        super(macro.name, vscode.TreeItemCollapsibleState.None);
        this.macro = macro;
        this.description = (0, logic_1.macroSummary)(macro.steps);
        this.contextValue = 'macroItem';
        this.command = {
            command: 'vsc-macros.applyMacro',
            title: 'Apply Macro',
            arguments: [macro]
        };
        this.tooltip = macro.steps
            .map((step, i) => `${i + 1}. ${step.useRegex ? '/' : ''}${step.find}${step.useRegex ? '/' : ''} -> ${step.replace}${step.note ? ` (${step.note})` : ''}`)
            .join('\n');
    }
}
async function getActiveEditorOrPrompt() {
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
//# sourceMappingURL=extension.js.map