import * as vscode from 'vscode';
import { exec } from 'child_process';
import { JiraUnifiedWebviewProvider } from './panel/JiraUnifieldWebview';
import { getGitRoot } from './gitHelper';

async function ensureGitRepo(cwd: string): Promise<boolean> {
  return new Promise(resolve => {
    exec('git rev-parse --is-inside-work-tree', { cwd }, err => {
      if (err) {
        vscode.window.showErrorMessage('Not a Git repository');
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const webviewProvider = new JiraUnifiedWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      JiraUnifiedWebviewProvider.viewType,
      webviewProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jiraBrancher.createBranch',
      async (issueKey: string): Promise<void> => {
        await promptForBranch(issueKey);
      }
    )
  );
}

export function deactivate(): void {}

async function promptForBranch(issueKey: string): Promise<void> {
  const branchType = await vscode.window.showQuickPick(
    ['feat', 'fix', 'docs', 'hotfix', 'refactor'],
    { placeHolder: 'Select branch type' }
  );
  if (!branchType) {
    return;
  }

  const title = await vscode.window.showInputBox({
    prompt: 'Enter branch title',
    validateInput: (input: string) => {
      if (input.trim() === '') {
        return 'Title is required';
      }
      return undefined;
    }
  });
  if (!title) {
    return;
  }

  const slug = title.trim().toLowerCase().replace(/\s+/g, '-');
  const branchName = `${branchType}/${issueKey}-${slug}`;

  // locate the Git repo via VS Code Git API
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (!gitExt) {
    vscode.window.showErrorMessage('Git extension not available');
    return;
  }
  const gitApi = gitExt.isActive
    ? gitExt.exports.getAPI(1)
    : (await gitExt.activate(), gitExt.exports.getAPI(1));
  const repo = gitApi.repositories[0];
  if (!repo) {
    vscode.window.showErrorMessage('No Git repository detected in your workspace');
    return;
  }
  const cwd = await getGitRoot();
  if (!cwd) { return; } // bail out early

  exec('git rev-parse --is-inside-work-tree', { cwd }, (insideErr) => {
    if (insideErr) {
      vscode.window.showErrorMessage('Not a Git repository');
      return;
    }

    exec(`git checkout -b ${branchName}`, { cwd }, (err, _stdout, stderr) => {
      if (err) {
        vscode.window.showErrorMessage(`Git error: ${stderr}`);
      } else {
        vscode.window.showInformationMessage(`Created branch: ${branchName}`);
      }
    });
  });
}
