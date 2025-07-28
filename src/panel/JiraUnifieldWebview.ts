// src/panel/JiraUnifiedWebview.ts
import * as vscode from 'vscode';
import axios from 'axios';
import { exec } from 'child_process';
import { getGitRoot } from '../gitHelper';

interface JiraIssue {
  key: string;
  summary: string;
  status: string;
}

export class JiraUnifiedWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'jiraBrancherUnified.view';
  private _view?: vscode.WebviewView;
  private _issues: JiraIssue[] = [];
  private _projects: string[] = [];
  private _config: vscode.WorkspaceConfiguration;
  private _currentProject = '';
  private _currentKeyword = '';
  private _pendingIssueKey: string | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._config = vscode.workspace.getConfiguration('jiraBrancher');
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this._view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    [this._projects, this._issues] = await Promise.all([
      this.fetchJiraProjects(),
      this.fetchJiraIssues()
    ]);

    webview.onDidReceiveMessage(async msg => {
      if (msg.command === 'filter') {
        this._currentProject = msg.project;
        this._currentKeyword = msg.keyword;
        const filtered = this.filterIssues(this._currentProject, this._currentKeyword);
        this._view?.webview.postMessage({ command: 'render', issues: filtered });
      } else if (msg.command === 'refresh') {
        this._currentProject = msg.project;
        this._currentKeyword = msg.keyword;
        this._issues = await this.fetchJiraIssues();
        const filtered = this.filterIssues(this._currentProject, this._currentKeyword);
        this._view?.webview.postMessage({ command: 'render', issues: filtered });
      } else if (msg.command === 'initBranchForm') {
        this._pendingIssueKey = msg.issueKey;
        this._view?.webview.postMessage({ command: 'showBranchForm', issueKey: msg.issueKey });
      } else if (msg.command === 'create') {

        const gitExt = vscode.extensions.getExtension('vscode.git');
        if (!gitExt) {
          vscode.window.showErrorMessage('Git extension not available');
          this._view?.webview.postMessage({ command: 'hideBranchForm' });
          return;
        }
        const gitApi = gitExt.isActive
          ? gitExt.exports.getAPI(1)
          : (await gitExt.activate(), gitExt.exports.getAPI(1));
        const repo = gitApi.repositories[0];
        if (!repo) {
          vscode.window.showErrorMessage('No Git repository detected in your workspace');
          this._view?.webview.postMessage({ command: 'hideBranchForm' });
          return;
        }

        const cwd = await getGitRoot();

        console.log('⚙️ Using Git repo at:', cwd);
       if (!cwd) {
          this._view?.webview.postMessage({ command: 'hideBranchForm' });
          return;
        }
        // verify we are inside a repo
        exec('git rev-parse --is-inside-work-tree', { cwd }, (insideErr) => {
          if (insideErr) {
            vscode.window.showErrorMessage('Not a Git repository');
            this._view?.webview.postMessage({ command: 'hideBranchForm' });
            return;
          }

          const branchType: string = msg.branchType;
          const description: string = msg.description.trim().toLowerCase().replace(/\s+/g, '-');
          const issueKey: string = msg.issueKey;
          const branchName = `${branchType}/${issueKey}-${description || 'branch'}`;

          exec(`git rev-parse --verify ${branchName}`, { cwd }, (verifyErr) => {
            if (!verifyErr) {
              vscode.window.showWarningMessage(`Branch "${branchName}" already exists`);
              this._view?.webview.postMessage({ command: 'hideBranchForm' });
            } else {
              exec(`git checkout -b ${branchName}`, { cwd }, (err, _stdout, stderr) => {
                if (err) {
                  vscode.window.showErrorMessage(`Git error: ${stderr}`);
                } else {
                  vscode.window.showInformationMessage(`Created branch: ${branchName}`);
                }
                this._view?.webview.postMessage({ command: 'hideBranchForm' });
              });
            }
          });
        });
      }
    });

    webviewView.webview.html = this._getHtml(webview, this._projects, this._issues);

    setInterval(async () => {
      this._issues = await this.fetchJiraIssues();
      const filtered = this.filterIssues(this._currentProject, this._currentKeyword);
      this._view?.webview.postMessage({ command: 'render', issues: filtered });
    }, 5 * 60 * 1000);
  }

  private async fetchJiraProjects(): Promise<string[]> {
    const domain = this._config.get<string>('jiraDomain');
    const email = this._config.get<string>('jiraEmail');
    const token = this._config.get<string>('jiraToken');
    if (!domain || !email || !token) {
      vscode.window.showErrorMessage('Missing Jira settings');
      return [];
    }
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    try {
      const res = await axios.get(`https://${domain}/rest/api/3/project`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
      });
      return Array.isArray(res.data) ? res.data.map((p: any) => p.key).sort() : [];
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to fetch projects: ${e.message}`);
      return [];
    }
  }

  private async fetchJiraIssues(): Promise<JiraIssue[]> {
    const domain = this._config.get<string>('jiraDomain');
    const email = this._config.get<string>('jiraEmail');
    const token = this._config.get<string>('jiraToken');
    if (!domain || !email || !token) {
      return [];
    }
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    try {
      const res = await axios.get(
        `https://${domain}/rest/api/3/search?jql=assignee=currentuser()`,
        { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
      );
      return res.data.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name
      }));
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to fetch issues: ${e.message}`);
      return [];
    }
  }

  private filterIssues(project: string, keyword: string): JiraIssue[] {
    const proj = project.trim().toLowerCase();
    const keyw = keyword.trim().toLowerCase();
    return this._issues.filter(issue => {
      const matchProj = !proj || issue.key.toLowerCase().startsWith(proj);
      const matchKeyw = !keyw ||
        issue.summary.toLowerCase().includes(keyw) ||
        issue.status.toLowerCase().includes(keyw);
      return matchProj && matchKeyw;
    });
  }

  private _getHtml(
    webview: vscode.Webview,
    projects: string[],
    issues: JiraIssue[]
  ): string {
    const nonce = getNonce();
    const projectOptions = projects.map(k => `<option value="${k}">${k}</option>`).join('');
    const renderList = (list: JiraIssue[]) =>
      list.map(i =>
        `<li>
           <span>${i.key}: ${i.summary} <em>(${i.status})</em></span>
           <button class="branch-btn" data-issue-key="${i.key}">Create Branch</button>
         </li>`
      ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body { font-family: sans-serif; padding: 10px; }
  #controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  #controls select,
  #controls input {
    flex: 1 1 40%;
    max-width: calc(50% - 12px);
    padding: 6px;
    font-size: 14px;
  }
  #controls button {
    padding: 6px 12px;
    font-size: 12px;
  }
  #branch-form {
    display: none;
    margin-bottom: 12px;
    padding: 10px;
    border: 1px solid #ccc;
    background: #f9f9f9;
  }
  #branch-form input,
  #branch-form select,
  #branch-form button {
    margin: 4px 4px 4px 0;
    font-size: 13px;
    padding: 4px 8px;
  }
  ul { list-style: none; padding: 0; margin-top: 10px; }
  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .branch-btn {
    font-size: 11px;
    padding: 4px 6px;
  }
</style>

</head>
<body>
  <div id="controls">
    <button id="refresh">Refresh</button>
    <select id="project">
      <option value="">— All projects —</option>
      ${projectOptions}
    </select>
    <input type="text" id="keyword" placeholder="Filter issues" />
  </div>
  <div id="branch-form">
    <h3>Create branch for <span id="bf-issueKey"></span></h3>
    <select id="branch-type">
      <option value="feat">feat</option>
      <option value="fix">fix</option>
      <option value="docs">docs</option>
      <option value="hotfix">hotfix</option>
      <option value="refactor">refactor</option>
    </select>
    <input type="text" id="branch-desc" placeholder="Short description" />
    <button id="branch-submit">Create</button>
    <button id="branch-cancel">Cancel</button>
  </div>
  <ul id="issues">${renderList(issues)}</ul>
  <script nonce="${nonce}">
    const vscodeApi = acquireVsCodeApi();
    const projEl = document.getElementById('project');
    const keyEl  = document.getElementById('keyword');
    const form   = document.getElementById('branch-form');
    let pendingKey = '';

    function updateFilter() {
      vscodeApi.postMessage({ command: 'filter', project: projEl.value, keyword: keyEl.value });
    }
    projEl.addEventListener('change', updateFilter);
    keyEl.addEventListener('input', updateFilter);

    document.getElementById('refresh').addEventListener('click', () => {
      vscodeApi.postMessage({ command: 'refresh', project: projEl.value, keyword: keyEl.value });
    });

    function initBranchForm(issueKey) {
      pendingKey = issueKey;
      document.getElementById('bf-issueKey').textContent = issueKey;
      form.style.display = 'block';
    }

    document.getElementById('branch-cancel').addEventListener('click', () => {
      form.style.display = 'none';
      pendingKey = '';
    });

document.getElementById('branch-submit').addEventListener('click', () => {
  const type = document.getElementById('branch-type').value;
  const desc = document.getElementById('branch-desc').value;
  vscodeApi.postMessage({ command: 'create', issueKey: pendingKey, branchType: type, description: desc });
});
    function attachBranchListeners() {
      document.querySelectorAll('button.branch-btn').forEach(btn => {
        const key = btn.getAttribute('data-issue-key');
        btn.addEventListener('click', () => initBranchForm(key));
      });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'render') {
        document.getElementById('issues').innerHTML = (${renderList.toString()})(msg.issues);
        attachBranchListeners();
      } else if (msg.command === 'showBranchForm') {
        initBranchForm(msg.issueKey);
      } else if (msg.command === 'hideBranchForm') {
        form.style.display = 'none';
      }
    });

    // wire up initial buttons
    attachBranchListeners();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
}

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
