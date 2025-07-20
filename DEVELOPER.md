# Developer Documentation

This document contains technical information for developers working on Claude Code Web UI.

For user instructions, see [README.md](README.md).

![React](https://img.shields.io/badge/react-18.x-blue.svg)
![Tests](https://img.shields.io/badge/tests-100%2B%20passing-green.svg)

## 🏗️ Architecture

### Backend (Node.js + Express + WebSocket)

```
server/
├── index.js                    # Main server with WebSocket handling
├── basic-session.test.js       # Basic session API tests (17 tests)
├── index.test.js              # Integration tests (13 tests)
└── path-security.test.js      # Security validation tests (24 tests)
```

**Key Components:**
- **Express Server**: REST API for session management
- **WebSocket Server**: Real-time terminal communication
- **PTY Integration**: Uses node-pty for proper terminal emulation
- **Session Store**: In-memory session management with persistence

### Frontend (React + xterm.js)

```
client/src/
├── App.js                           # Main application component
├── components/
│   ├── PathInput.js                 # Working directory input
│   ├── Terminal.js                  # Terminal interface
│   └── SessionList.js               # Session management UI
└── tests/                           # Component tests (70+ tests)
```

**Key Features:**
- **React 18**: Modern React with hooks and functional components
- **xterm.js**: Professional terminal emulator
- **WebSocket Client**: Real-time communication with backend
- **Responsive UI**: Mobile-first design with desktop optimization

### Data Flow

```
User Input → WebSocket → PTY Process → Claude Code CLI
     ↓           ↑            ↑              ↓
Web Terminal ← WebSocket ← PTY Output ← Claude Response
```

### Critical Architecture Details

#### Session Management System
- **Two-Map Architecture**: `allSessions` (sessionId → session data) and `wsSessions` (ws → sessionIds array)
- **Handler Deduplication**: `handlersSetup` flag prevents duplicate PTY event listeners during reconnection
- **Session Lifecycle**: PTY processes persist beyond WebSocket connections with cleanup after 2-minute timeout

#### Message Processing (Frontend)
- **Sequential Processing**: `processedMessagesRef` tracks processed message count to prevent infinite loops
- **Buffer Management**: Terminal buffer handled by xterm.js, not server-side content filtering
- **Input Guards**: Input/resize events blocked when `currentSessionId` is null

#### Enhanced Data Flow
1. User enters path and starts session
2. Backend validates and normalizes path (applying prefix if configured)
3. Backend creates directory recursively if it doesn't exist
4. Backend sends path information to frontend for display
5. Backend spawns Claude Code CLI with node-pty in the normalized directory
6. PTY output streams to WebSocket → Frontend terminal (16ms buffering)
7. User input from terminal → WebSocket → PTY process (with session validation)
8. Terminal resize events propagated to PTY
9. Session disconnection triggers 2-minute cleanup timer

## 🧪 Testing

### Test Suites

```bash
# Server Tests
npm test

# Client Tests
cd client && npm test

# All Tests
npm run test:all
```

### Test Categories

- **Unit Tests**: Individual component functionality
- **Integration Tests**: Component interaction and API endpoints
- **Regression Tests**: Prevention of known bugs
- **UI Tests**: User interaction workflows
- **API Tests**: Server endpoint validation
- **Security Tests**: Path validation and directory creation

### Test Coverage

- **Server Tests**:
  - Basic session management (`server/basic-session.test.js`)
  - Server integration tests (`server/index.test.js`)
  - Path security and validation (`server/path-security.test.js`)
  - API endpoints, session lifecycle, security validation, and directory creation

- **Client Tests**:
  - App component WebSocket logic (`src/App.test.js`)
  - Terminal component & reconnection (`src/components/Terminal.test.js`)
  - Session list UI & interactions (`src/components/SessionList.test.js`)
  - Path input validation (`src/components/PathInput.test.js`)

### Critical Regression Tests
- Terminal input functionality after session reconnection
- Buffer restoration and handler setup
- Multi-session switching and management
- Path validation and directory creation with security checks
- Frontend display of normalized paths and prefix information

## 🛠️ Development

### Development Workflow (TDD)

The project follows Test-Driven Development principles:

1. **Red Phase**: Write failing tests for new functionality
2. **Green Phase**: Implement minimal code to pass tests
3. **Build & Validate**: Run full build and test cycle
4. **Refactor**: Clean up code while keeping tests green

### Essential Commands

```bash
# Development workflow
npm run build              # Build production assets
npm test                   # Run server tests (must pass)
cd client && npm test      # Run client tests (must pass)
npm run lint              # Code quality checks

# Development servers
npm run dev               # Both frontend and backend
npm run server            # Backend only
npm run client            # Frontend only
```

### Code Quality

- **ESLint**: JavaScript/React code linting
- **Test Coverage**: 100+ tests covering critical paths
- **Type Safety**: Proper error handling and validation
- **Performance**: Optimized terminal rendering and memory usage

## 📁 Project Structure

```
claude-code-web-ui/
├── README.md                 # User documentation
├── DEVELOPER.md             # This file (developer docs)
├── CLAUDE.md                # Detailed development guidance
├── package.json             # Backend dependencies
├── server/                  # Backend source code
│   ├── index.js            # Main server
│   └── *.test.js           # Server tests
├── client/                 # Frontend application
│   ├── package.json        # Frontend dependencies
│   ├── public/             # Static assets
│   ├── src/                # React source code
│   └── build/              # Production build (generated)
└── docs/                   # Additional documentation
```

## 🔧 Configuration

### Environment Variables

```bash
# Server configuration
PORT=3001                              # Server port (default: 3001)
NODE_ENV=production                   # Environment mode
WORKING_DIR_PREFIX=/path/to/sandbox   # Working directory prefix for security
CLAUDE_CLI_ARGS="--verbose --no-color" # Custom arguments for Claude CLI

# Client configuration  
REACT_APP_WS_URL=ws://localhost:3001  # WebSocket URL
```

### Server Settings

- **Port**: 3001 (configurable via PORT environment variable)
- **Session Timeout**: 2 minutes for inactive sessions
- **Buffer Limit**: 50KB per session terminal buffer
- **Cleanup Interval**: 10 seconds for session maintenance

### 🔒 Working Directory Prefix (Security Feature)

The `WORKING_DIR_PREFIX` environment variable provides a security mechanism to limit where Claude Code sessions can be created:

```bash
# Example: Restrict all sessions to run within /tmp/sandbox
export WORKING_DIR_PREFIX=/tmp/sandbox

# Start the server
npm run server
```

**How it works:**
- When a user enters `/Users/john/project`, the actual working directory becomes `/tmp/sandbox/Users/john/project`
- When a user enters `project`, the actual working directory becomes `/tmp/sandbox/project`
- All path traversal attempts (`../`, `./`) are automatically rejected for security
- **Automatic Directory Creation**: If the directory doesn't exist, it will be created recursively
- **Path Display**: The web UI shows the actual normalized path when a prefix is applied

**Security protections:**
- **Path traversal prevention**: Blocks `../` and `./` sequences
- **Null byte protection**: Rejects paths containing null bytes
- **Path validation**: Validates path format and length
- **Prefix enforcement**: All paths are prefixed with the configured directory

**Example configurations:**
```bash
# Sandbox all sessions in /tmp
WORKING_DIR_PREFIX=/tmp

# Restrict to user's home directory  
WORKING_DIR_PREFIX=/home/ubuntu

# No prefix (default - allows any valid path)
# WORKING_DIR_PREFIX=
```

### 🔧 Claude CLI Arguments Configuration

The `CLAUDE_CLI_ARGS` environment variable allows you to customize the arguments passed to the Claude Code CLI process when starting sessions:

```bash
# Default behavior (if not set)
# CLAUDE_CLI_ARGS=""  # Uses: --dangerously-skip-permissions

# Custom arguments using space-separated format
export CLAUDE_CLI_ARGS="--verbose --no-color --debug"

# Custom arguments using JSON array format (for complex arguments)
export CLAUDE_CLI_ARGS='["--config", "/path/to/config.json", "--verbose"]'

# Start the server
npm run server
```

**Supported formats:**
- **Space-separated**: `"--verbose --no-color --debug"`
- **JSON array**: `'["--config", "/path/to/config.json", "--verbose"]'`
- **Empty**: Uses default `--dangerously-skip-permissions`

**Example configurations:**
```bash
# Verbose output with no colors
CLAUDE_CLI_ARGS="--verbose --no-color"

# Debug mode with custom config
CLAUDE_CLI_ARGS='["--debug", "--config", "/etc/claude/config.json"]'

# Minimal permissions (remove yolo mode)
CLAUDE_CLI_ARGS=""  # This will use default: --dangerously-skip-permissions

# Custom timeout and no interactive mode
CLAUDE_CLI_ARGS="--timeout=60 --no-interactive --verbose"
```

**Security note**: Only use trusted arguments as they directly control the Claude CLI execution environment.

## 🚨 Development Troubleshooting

### Server Development Issues

**Tests failing:**
```bash
# Clean install dependencies
rm -rf node_modules client/node_modules
npm install && cd client && npm install

# Rebuild and test
npm run build && npm test
```

**Build errors:**
```bash
# Clear build cache
cd client && rm -rf build node_modules/.cache
npm run build
```

### Performance Issues

- **High memory usage**: Check for orphaned sessions in Active Sessions list
- **Slow terminal**: Reduce terminal buffer size or check network latency
- **Connection drops**: Verify WebSocket proxy configuration

## 🤝 Contributing

### Development Setup

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Follow TDD workflow**: Write tests first, then implement
4. **Validate changes**: Run full build and test cycle
5. **Submit a pull request**

### Pull Request Guidelines

- **All tests must pass**: Run `npm run build && npm test && cd client && npm test`
- **Follow TDD**: Include tests for new functionality
- **Code quality**: Ensure ESLint passes
- **Documentation**: Update README/DEVELOPER.md if needed

### Bug Reports

When reporting bugs, please include:
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Browser/Node.js versions**
- **Console logs/error messages**

## 🔒 Security Implementation Details

### Path Validation Functions

The backend implements comprehensive path security:

```javascript
// Validates and normalizes user-provided paths
function validateAndNormalizePath(userPath) {
  // Security checks for empty paths, null bytes, path traversal
  // Applies working directory prefix if configured
  // Returns normalized path with validation status
}

// Creates directories recursively with security validation
async function validateAndCreatePath(userPath) {
  // Validates path first using validateAndNormalizePath
  // Creates directory structure if it doesn't exist
  // Returns creation status and validation results
}
```

### Frontend Security Features

- Path information display with prefix indication
- Directory creation status with animated feedback
- State management to prevent security indicator reuse

## Important Implementation Details

### Terminal Message Processing
- **Critical Fix**: `processedMessagesRef.current` must not be reset in `useEffect` dependencies to prevent message reprocessing loops
- **Error Handling**: All message processing wrapped in try-catch with guaranteed counter incrementation
- **Session Validation**: Input/resize commands require valid `currentSessionId` to prevent routing errors

### PTY Event Management
- **Listener Cleanup**: Always call `removeAllListeners()` before setting up new handlers
- **Single Handler Rule**: Use `handlersSetup` flag to ensure one handler per session
- **Buffer Timing**: 16ms output buffering prevents UI fragmentation while maintaining responsiveness

### Session State Management
- **Persistence Strategy**: Sessions survive WebSocket disconnections via `allSessions` map
- **Reconnection Logic**: 2-minute timeout allows users to reconnect after network issues
- **Memory Management**: Automatic cleanup of orphaned sessions and PTY processes
- **Status Tracking**: Active/disconnected states with last-seen timestamps
- **Buffer Management**: Terminal content preserved during reconnections (50KB limit)

### Mobile Support
- **Responsive Design**: Mobile menu collapses header buttons on small screens
- **Touch Optimization**: Terminal sizing and interaction optimized for mobile devices

## 🙏 Acknowledgments

- **Claude Code CLI**: The underlying Claude Code command-line interface
- **xterm.js**: Professional terminal emulator for the web
- **node-pty**: Pseudo terminal bindings for Node.js
- **React**: User interface library
- **Express.js**: Web application framework

## 📞 Developer Support

- **Documentation**: See [CLAUDE.md](CLAUDE.md) for detailed development guidance and TDD workflow
- **Issues**: Submit bug reports and feature requests via GitHub Issues
- **Development**: Follow the TDD workflow documented in CLAUDE.md

---

**For detailed development workflow and TDD guidelines, see [CLAUDE.md](CLAUDE.md)**
