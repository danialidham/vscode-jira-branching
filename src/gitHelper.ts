import * as vscode from 'vscode';
import { exec } from 'child_process';


export async function getGitRoot(): Promise<string | null> {
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (!gitExt) {
    vscode.window.showErrorMessage('Git extension not available');
    return null;
  }

  const gitApi = gitExt.isActive
    ? gitExt.exports.getAPI(1)
    : (await gitExt.activate(), gitExt.exports.getAPI(1));

  // the API already filters ignored and closed repos
  if (gitApi.repositories.length === 0) {
    vscode.window.showErrorMessage('No Git repository detected in your workspace');
    return null;
  }

  const root = gitApi.repositories[0].rootUri.fsPath;

  // double-check with Git itself
  const ok = await new Promise<boolean>(resolve =>
    exec('git rev-parse --is-inside-work-tree', { cwd: root }, err => resolve(!err))
  );
  if (!ok) {
    vscode.window.showErrorMessage('Folder is not a valid Git repository');
    return null;
  }

  return root;
}
