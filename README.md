A web browser interface for Claude Code CLI that lets you interact with Claude through your browser. Think of it as a web-based terminal for Claude that you can access from anywhere on your local network.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)

<img width="239" height="166" alt="1" src="https://github.com/user-attachments/assets/79ae4d4b-8ef0-4825-b09c-71ca7c9f7c11" />
<img width="239" height="166" alt="2" src="https://github.com/user-attachments/assets/c7a47670-71f4-46c4-9665-437a8db58eff" />
<img width="239" height="166" alt="3" src="https://github.com/user-attachments/assets/bdb53175-0a5c-45c2-972c-e3e8d95fb2dd" />

## ⚠️ Security Notice

**IMPORTANT: This application is very powerful and should only be used in secure environments.**

- 🏠 **Local Network Only**: Only run this on your private network (home/office)
- 🚫 **No Public Access**: Never expose this to the internet or public networks
- 👤 **Personal Use**: Only you should have access to this interface
- 🔒 **Additional Security**: For enhanced security, consider running in a sandbox environment

**Why this matters**: Claude Code has full access to your computer's filesystem and can execute commands. This web interface provides the same level of access through a browser, which could be dangerous if accessed by unauthorized users.

## 🚀 Quick Setup

### What You Need

- **Node.js** 16.0.0 or newer ([Download here](https://nodejs.org/))
- **Claude Code CLI** installed and working ([Setup instructions](https://docs.anthropic.com/claude/docs/claude-code))

### Installation

1. **Download this project**
   ```bash
   git clone <repository-url>
   cd claude-code-web-ui
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Build the application**
   ```bash
   npm run build
   ```

4. **Start the server**
   ```bash
   npm run server
   ```
   
   *Optional: Configure Claude CLI arguments*
   ```bash
   # Example: Run Claude with debug and verbose output
   CLAUDE_CLI_ARGS="--debug --verbose" npm run server
   ```

5. **Open your browser**
   - Go to `http://localhost:3001`
   - You should see the Claude Code Web interface

## 📖 How to Use

### Starting Your First Session

1. **Open the web interface** at `http://localhost:3001`
2. **Choose a working directory** - this is where Claude will work (like `/Users/yourname/Documents/myproject`)
3. **Click "Start Session"**
4. **Start chatting with Claude** in the terminal interface

### Managing Multiple Sessions

- **View All Sessions**: Click "Active Sessions" to see all running Claude sessions
- **Switch Sessions**: Click "Reconnect" to switch between different sessions
- **Create New Sessions**: Click "New Session" to start additional Claude instances
- **Remove Sessions**: Click "Remove" to stop a session when you're done

### Session Features

- **Persistent Sessions**: Claude keeps running even if you close your browser
- **Reconnect Anytime**: Close and reopen your browser - your sessions will still be there
- **Multiple Projects**: Run Claude in different directories for different projects
- **Mobile Friendly**: Works on phones and tablets too

## 🚨 Troubleshooting

### Server Won't Start

**Error: Port already in use**
```bash
# Find what's using port 3001
lsof -i :3001
# Kill the process or use a different port
```

**Error: Claude command not found**
```bash
# Check if Claude CLI is installed
which claude
# If not found, install Claude Code CLI first
```

## 📱 Mobile Usage

The interface works on mobile devices:
- Touch-friendly controls
- Responsive design
- Swipe gestures for session management

Access the same URL (`http://your-computer-ip:3001`) from your phone while on the same network.

## 🆘 Getting Help

- **Issues**: Report problems on GitHub Issues
- **Questions**: Check existing issues for similar problems
- **Updates**: Watch the repository for updates and security fixes

## 📄 License

This project is open source under the MIT License.

---

**For Developers**: See [DEVELOPER.md](DEVELOPER.md) for technical documentation, architecture details, and development instructions.
