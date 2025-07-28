# Jira Brancher

Create Git branches directly from Jira tickets in VS Code using a unified sidebar panel with inline filtering and branch creation.

## Features

* Unified Panel, view your Jira projects and issues in a sidebar Webview
* Project Dropdown, select from your Jira projects fetched dynamically
* Keyword Filter, search by summary or status keywords
* Auto and Manual Refresh, issues auto refresh every 5 minutes or on demand
* Inline Branch Form, click **Create Branch** next to any ticket to open a form for branch type and description
* Branch Creation, checks if the branch exists before creating via `git checkout -b <type>/<TICKET>-<slug>`
* Secure Settings, Jira domain, email and API token stored in VS Code settings

## Requirements

* VS Code version compatible with Webview Views
* Git installed and your workspace initialized as a Git repository
* A Jira API token (generate one [here](https://id.atlassian.com/manage/api-tokens))

## Extension Settings

Configure these under **File › Preferences › Settings** or in your `settings.json`:

```json
{
  "jiraBrancher.jiraDomain": "mycompany.atlassian.net",
  "jiraBrancher.jiraEmail": "you@company.com",
  "jiraBrancher.jiraToken": "YOUR_API_TOKEN"
}

Getting Started
Install the extension in VS Code

Open the sidebar by clicking the Jira Brancher icon in the Activity Bar

Select your project from the dropdown or enter a keyword to filter issues

Refresh manually with the Refresh button or wait for the five minute auto refresh

Click Create Branch next to a ticket to open the branch form

Choose a branch type (feat, fix, docs, hotfix, refactor) and enter a short description

Submit to run git checkout -b <type>/<TICKET>-<slug> automatically

Release Notes
0.0.5
Added inline branch creation form with type and description
Dynamic project dropdown
Manual and five minute auto refresh
Branch existence check before creation

0.0.1
Initial release

License
MIT

