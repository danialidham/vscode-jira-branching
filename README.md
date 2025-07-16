# Jira Brancher

Create Git branches directly from Jira tickets in VS Code.

## Features

- Fetches Jira tickets assigned to you
- Lets you select the ticket and branch type
- Automatically creates a branch like: `fix/PROJ-123-fix-login-page`
- Securely stores Jira API token and email using VS Code's secret storage

## Setup

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run `Create Git Branch from Jira Ticket`
3. Enter your Jira domain (e.g., `yourcompany.atlassian.net`)
4. Enter your Jira email and API token (stored securely)
5. Select a ticket, branch type, and provide a short description

## Requirements

- A Jira API token ([generate one here](https://id.atlassian.com/manage/api-tokens))
- Git installed and initialized in your workspace

## Extension Settings

- `jiraBrancher.jiraDomain`: Your Jira domain

## Release Notes

### 0.0.1

- Initial release

---

## License

MIT
