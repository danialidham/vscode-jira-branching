import * as vscode from 'vscode';
import { exec } from 'child_process';
import axios from 'axios';

interface JiraSearchResult {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
    };
  }>;
}

class JiraIssueTreeItem extends vscode.TreeItem {
  constructor(
    public readonly issueKey: string,
    public readonly summary: string,
    public readonly status: string
  ) {
    super(`${issueKey}: ${summary}`, vscode.TreeItemCollapsibleState.None);
    this.description = status;
    this.contextValue = 'jiraIssueItem';
  }
}

class JiraIssuesProvider implements vscode.TreeDataProvider<JiraIssueTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<JiraIssueTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private items: JiraIssueTreeItem[] = [];

  refresh(items: JiraIssueTreeItem[]) {
    this.items = items;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(item: JiraIssueTreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): Thenable<JiraIssueTreeItem[]> {
    return Promise.resolve(this.items);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('jiraBrancher');

  const provider = new JiraIssuesProvider();
  vscode.window.registerTreeDataProvider('jiraIssuesView', provider);

  async function fetchJiraIssues(): Promise<JiraIssueTreeItem[] | null> {
    const domain = config.get<string>('jiraDomain');
    const email = config.get<string>('jiraEmail');
    const token = config.get<string>('jiraToken');

    console.log('Domain:', domain);
console.log('Email:', email);
console.log('Token:', token ? '✓' : 'Missing');


    if (!domain || !email || !token) {
      vscode.window.showErrorMessage('Missing Jira settings. Please set jiraDomain, jiraEmail, and jiraToken in your VS Code settings.');
      return null;
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    try {
      const res = await axios.get<JiraSearchResult>(
        `https://${domain}/rest/api/3/search?jql=assignee=currentuser()`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json'
          }
        }
      );

      return res.data.issues.map(issue => new JiraIssueTreeItem(
        issue.key,
        issue.fields.summary,
        issue.fields.status.name
      ));
    } catch (err: any) {
      console.error('Jira fetch failed:', err);
      vscode.window.showErrorMessage(`Failed to fetch Jira issues: ${err.message}`);
      return null;
    }
  }

  async function promptForBranch(issueKey: string) {
    const branchType = await vscode.window.showQuickPick(
      ['feat', 'fix', 'docs', 'hotfix', 'refactor'].map(label => ({ label })),
      { placeHolder: 'Select branch type' }
    );
    if (!branchType) return;

    const title = await vscode.window.showInputBox({
      prompt: 'Enter branch title',
      validateInput: text => text.trim() === '' ? 'Title required' : undefined
    });
    if (!title) return;

    const description = await vscode.window.showInputBox({
      prompt: 'Optional: add description',
      ignoreFocusOut: true
    });

    const slug = title.trim().toLowerCase().replace(/\s+/g, '-');
    const branchName = `${branchType.label}/${issueKey}-${slug}`;

    exec(`git checkout -b ${branchName}`, (err, stdout, stderr) => {
      if (err) {
        vscode.window.showErrorMessage(`Git error: ${stderr}`);
      } else {
        vscode.window.showInformationMessage(`Created branch: ${branchName}`);
      }
    });

    if (description) {
      console.log('Branch description:', description);
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand('jiraBrancher.createBranch', async () => {
    const issues = await fetchJiraIssues();
    if (!issues) return;

    provider.refresh(issues);

    const pick = await vscode.window.showQuickPick<{ label: string; issueKey: string }>(
      issues.map(i => ({
        label: typeof i.label === 'string' ? i.label : (typeof i.label?.label === 'string' ? i.label.label : i.issueKey),
        issueKey: i.issueKey
      })),
      { placeHolder: 'Select Jira ticket' }
    );
    if (!pick) return;

    await promptForBranch(pick.issueKey);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('jiraBrancher.createBranchFromItem', async (item: JiraIssueTreeItem) => {
    if (!item) return;
    await promptForBranch(item.issueKey);
  }));

  const issues = await fetchJiraIssues();
  if (issues) provider.refresh(issues);
}

export function deactivate() {}
