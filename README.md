# vscode-remcon — Remote Connection Manager

Remote Connection Manager — SSH/SFTP terminal, file browser, and more.

## Features

- **Multi-host management** — add, edit, delete, group connections
- **Integrated terminal** — open SSH shells in VS Code terminals
- **SFTP file browser** — browse, upload/download, edit remote files
- **Port forwarding** — local (`-L`) and remote (`-R`) tunnels
- **Batch operations** — run commands across multiple hosts
- **Quick connect/disconnect** — fast switching from command palette
- **SSH config import** — import from `~/.ssh/config` with auto-watch
- **Key management** — generate key pairs and deploy public keys
- **Global search** — search across all connections
- **Export/import** — JSON-based backup and restore
- **Health monitoring** — automatic heartbeat detection
- **Remote file editing** — open and auto-sync remote files
- **Connection test** — one-click connectivity check
- **Multi-language** — Chinese and English UI support

## Getting Started

1. Install the extension from the VS Code marketplace
2. Click the **RemCon** icon in the activity bar
3. Click the `+` button or run **RemCon: Add Connection**
4. Enter the connection name, host, port, and username
5. Choose password or private key authentication

Your host appears in the ONLINE/OFFLINE views.

| View        | Description                        |
| ----------- | ---------------------------------- |
| **ONLINE**  | Currently connected servers        |
| **OFFLINE** | Disconnected servers               |
| **SFTP**    | File browser for connected servers |

## Usage

### Connections

| Action         | How                                |
| -------------- | ---------------------------------- |
| **Add**        | Click + icon or run Add Connection |
| **Edit**       | Right-click > Edit Connection      |
| **Delete**     | Right-click > Delete Connection    |
| **Connect**    | Click >> icon or Quick Connect     |
| **Disconnect** | Click # icon or Quick Disconnect   |
| **Test**       | Click test icon on offline host    |

### SFTP File Management

After connecting, switch to the **SFTP** view and
expand the server node:

- Click a file to open it in the editor
  (auto-syncs on save)
- Right-click for upload, download, new
  file/folder, rename, delete
- Folders support recursive download
- **Upload from Explorer** — right-click files/folders
  in VS Code's file explorer and select
  *Upload to Remote...*
- **Smart workspace sync** — with a workspace folder
  open, upload/download preserves relative paths;
  without one, a save dialog is shown

### Project-Level Configuration

Place a `.vscode/remcon.json` file in your project
root to set the remote working directory per server:

```json
{
  "my-server": "/var/www/project",
  "staging": "/opt/app"
}
```

The SFTP tree and Explorer upload will use the
configured directory as the root. If the directory
doesn't exist on the remote or no config is found,
the user's home directory is used as fallback.

### Port Forwarding

1. Select **Add Port Forward** on an online host
2. Choose **Local** (`-L`) or **Remote** (`-R`)
3. Enter the bind port and target host:port
4. Use **List Active Tunnels** to view and close
   tunnels

### Key Management

- **Generate SSH Key Pair** — ED25519 or RSA 4096
- **Deploy Public Key** — select server, pick a
  `.pub` file

### Host File Auto-Import

Set `remcon.hostfile.enabled` to `true` and create a
JSON file (default `~/.remcon/hosts.json`):

```json
[
  {
    "name": "my-server",
    "host": "192.168.1.1",
    "port": 22,
    "username": "root",
    "privateKey": "/path/to/id_rsa"
  }
]
```

Entries are imported on activation and when the file
changes. Duplicates (same name or host:port) are
skipped.

### Batch Commands

Run **RemCon: Batch Execute**, select hosts, enter
a command, and view aggregated results.

### Import from SSH Config

Run **RemCon: Import from SSH Config** to import
from `~/.ssh/config`. The extension watches for
configuration file changes.

## Configuration

| Setting                            | Default | Note                        |
| ---------------------------------- | ------- | --------------------------- |
| `remcon.default.pingHostTime`      | `30`    | Ping interval (sec)         |
| `remcon.default.refreshNodeTime`   | `30`    | Refresh interval (sec)      |
| `remcon.default.showHiddenFiles`   | `false` | Show hidden SFTP files      |
| `remcon.default.openFileMaxSize`   | `10`    | Max open file size (MB)     |
| `remcon.default.readyTimeout`      | `10000` | SSH connect timeout (ms)    |
| `remcon.default.keepaliveInterval` | `30000` | SSH keepalive interval(ms)  |
| `remcon.default.keepaliveCountMax` | `3`     | SSH keepalive retry count   |
| `remcon.default.tryKeyboard`       | `true`  | Keyboard-interactive auth   |
| `remcon.locale`                    | `auto`  | Language (en/zh-cn)         |
| `remcon.hostfile.enabled`          | `false` | Auto-import hosts from JSON |

## Keyboard Shortcuts

| Shortcut     | Command            |
| ------------ | ------------------ |
| `Ctrl+Alt+R` | Refresh views      |
| `Ctrl+Alt+Q` | Quick connect      |
| `Ctrl+Alt+W` | Quick disconnect   |
| `Ctrl+Alt+F` | Search connections |
| `Ctrl+Alt+B` | Batch operations   |

## Commands

### Connection Management

| Command                   | Description                         |
| ------------------------- | ----------------------------------- |
| `remcon.add`              | Add a new connection                |
| `remcon.edit`             | Edit connection                     |
| `remcon.delete`           | Delete connection                   |
| `remcon.refresh`          | Refresh all views                   |
| `remcon.reload`           | Reload VS Code window               |
| `remcon.clearAll`         | Clear all connections               |
| `remcon.quickConnect`     | Select offline host + open terminal |
| `remcon.quickDisconnect`  | Select online host + disconnect     |
| `remcon.connect.terminal` | Open SSH terminal for host          |
| `remcon.disconnect`       | Disconnect selected host            |
| `remcon.testConnection`   | Test connectivity for offline host  |

### SFTP Commands

| Command                        | Description                           |
| ------------------------------ | ------------------------------------- |
| `remcon.sftp.download`         | Download file or directory            |
| `remcon.sftp.upload`           | Upload file                           |
| `remcon.sftp.uploadExplorer`   | Upload from Explorer (right-click)    |
| `remcon.sftp.newFile`          | Create new remote file                |
| `remcon.sftp.newFolder`        | Create new remote folder              |
| `remcon.sftp.delete`           | Delete remote file/folder             |
| `remcon.sftp.rename`           | Rename remote file/folder             |
| `remcon.sftp.open`             | Open remote file in editor            |
| `remcon.sftp.refresh`          | Refresh SFTP view                     |

### Port Forwarding Commands

| Command              | Description               |
| -------------------- | ------------------------- |
| `remcon.tunnel.add`  | Add port forward (L or R) |
| `remcon.tunnel.list` | List all active tunnels   |

### Search & Batch

| Command         | Description                   |
| --------------- | ----------------------------- |
| `remcon.search` | Search across all connections |
| `remcon.batch`  | Execute on multiple hosts     |

### Key Management Commands

| Command               | Description           |
| --------------------- | --------------------- |
| `remcon.key.generate` | Generate SSH key pair |
| `remcon.key.deploy`   | Deploy public key     |

### Import/Export

| Command                   | Description                  |
| ------------------------- | ---------------------------- |
| `remcon.import.sshConfig` | Import from `~/.ssh/config`  |
| `remcon.export`           | Export connections to JSON   |
| `remcon.import`           | Import connections from JSON |

### Localization

| Command               | Description             |
| --------------------- | ----------------------- |
| `remcon.setLocale`    | Set language (en/zh-cn) |
| `remcon.openSettings` | Open extension settings |
