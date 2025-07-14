// src/extension.ts
import * as vscode from 'vscode';
import { exec } from 'child_process';
import axios, { AxiosResponse } from 'axios';

interface JiraIssueQuickPickItem extends vscode.QuickPickItem {
  issueKey: string;
}

interface JiraSearchResult {
  issues: Array<{
    key: string;
    fields: {
      summary: string;
      status: { name: string };
    };
  }>;
}

export async function activate(context: vscode.ExtensionContext) {
  const secretStorage = context.secrets;

  const disposable = vscode.commands.registerCommand('jiraBrancher.createBranch', async () => {
    const config = vscode.workspace.getConfiguration('jiraBrancher');
    let domain = config.get<string>('jiraDomain');

    if (!domain) {
      domain = await vscode.window.showInputBox({ prompt: 'Enter your Jira domain (e.g., mycompany.atlassian.net)' });
      if (domain) {
        await config.update('jiraBrancher.jiraDomain', domain, vscode.ConfigurationTarget.Global);
      } else {
        vscode.window.showErrorMessage('Jira domain is required');
        return;
      }
    }

    let token = await secretStorage.get('jiraToken');
    if (!token) {
      token = await vscode.window.showInputBox({ prompt: 'Enter your Jira API token', password: true });
      if (!token) {
        vscode.window.showErrorMessage('Jira API token is required');
        return;
      }
      await secretStorage.store('jiraToken', token);
    }

    let email = await secretStorage.get('jiraEmail');
    if (!email) {
      email = await vscode.window.showInputBox({ prompt: 'Enter your Jira account email' });
      if (!email) {
        vscode.window.showErrorMessage('Jira email is required');
        return;
      }
      await secretStorage.store('jiraEmail', email);
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    let response: AxiosResponse<JiraSearchResult>;

    try {
      response = await axios.get<JiraSearchResult>(
        `https://${domain}/rest/api/3/search?jql=assignee=currentuser()`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: 'application/json'
          }
        }
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error fetching Jira issues: ${err.message}`);
      return;
    }

    const data = response.data;
    if (!data.issues) {
      vscode.window.showErrorMessage('Unexpected response format from Jira');
      return;
    }

    const issues: JiraIssueQuickPickItem[] = data.issues.map(issue => ({
      label: `${issue.key}: ${issue.fields.summary}`,
      description: issue.fields.status.name,
      issueKey: issue.key
    }));

    const selection = await vscode.window.showQuickPick(issues, {
      placeHolder: 'Select a Jira ticket'
    });
    if (!selection) {
      return;
    }

    const branchTypes = [
      { label: 'feat', description: 'A new feature' },
      { label: 'fix', description: 'A bug fix' },
      { label: 'hotfix', description: 'A critical fix for production' },
      { label: 'doc', description: 'Documentation changes' },
      { label: 'refactor', description: 'Code refactoring' }
    ];

    const branchType = await vscode.window.showQuickPick(branchTypes, {
      placeHolder: 'Select branch type'
    });
    if (!branchType) {
      return;
    }

    const desc = await vscode.window.showInputBox({ prompt: 'Short description for branch name' });
    if (!desc) {
      return;
    }

    const safeDesc = desc.trim().toLowerCase().replace(/\s+/g, '-');
    const branchName = `${branchType.label}/${selection.issueKey.toLowerCase()}-${safeDesc}`;

    exec(`git checkout -b ${branchName}`, (err, stdout, stderr) => {
      if (err) {
        vscode.window.showErrorMessage(`Git error: ${stderr}`);
      } else {
        vscode.window.showInformationMessage(`Created and switched to branch: ${branchName}`);
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}