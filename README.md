# Claude Code Web UI

A modern web interface for Claude Code CLI with real-time bi-directional streaming support. This application provides an intuitive browser-based terminal interface for interacting with Claude Code, complete with session management, persistence, and multi-session support.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
![React](https://img.shields.io/badge/react-18.x-blue.svg)
![Tests](https://img.shields.io/badge/tests-100%2B%20passing-green.svg)

## ✨ Features

### 🖥️ **Web-Based Terminal Interface**
- Full-featured terminal using xterm.js
- Real-time streaming of input/output
- Terminal resizing and responsive design
- Mobile-optimized interface

### 🔄 **Session Management**
- Create multiple Claude Code sessions
- List and manage active sessions
- Reconnect to existing sessions after disconnect
- Session persistence with automatic cleanup
- Working directory path selection

### 🌐 **Real-Time Communication**
- WebSocket-based bi-directional streaming
- 16ms buffering for smooth terminal updates
- Automatic reconnection handling
- Session state synchronization

### 📱 **Responsive Design**
- Desktop and mobile support
- Collapsible mobile menu
- Touch-optimized controls
- Adaptive terminal sizing

### 🛡️ **Robust Architecture**
- Test-driven development (100+ tests)
- Comprehensive error handling
- Memory leak prevention
- Process lifecycle management

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16.0.0 or higher
- **npm** or **yarn**
- **Claude Code CLI** installed and accessible in PATH

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd claude-code-web-ui

# Install dependencies
npm install
cd client && npm install && cd ..

# Build the application
npm run build

# Start the server
npm run server
```

The application will be available at `http://localhost:3001`

### Development Mode

```bash
# Run both frontend and backend in development mode
npm run dev

# Or run separately:
npm run server    # Backend only (port 3001)
npm run client    # Frontend only (port 3000)
```

## 📖 Usage

### Starting a Session

1. **Access the web interface** at `http://localhost:3001`
2. **Enter a working directory path** where you want Claude Code to run
3. **Click "Start Session"** to create a new Claude Code session
4. **Interact with Claude Code** through the web terminal interface

### Managing Sessions

- **View Active Sessions**: Click the "Active Sessions" button to see all running sessions
- **Reconnect**: Click "Reconnect" on any session to resume interaction
- **Remove Sessions**: Click "Remove" to terminate a session and clean up resources
- **Create New**: Use "Start New Session" to launch additional sessions

### Session Features

- **Session Persistence**: Sessions continue running even if you close the browser
- **Automatic Cleanup**: Inactive sessions are cleaned up after 2 minutes
- **Buffer Restoration**: Terminal content is preserved when reconnecting
- **Multi-Session Support**: Run multiple Claude Code instances simultaneously

## 🏗️ Architecture

### Backend (Node.js + Express + WebSocket)

```
server/
├── index.js              # Main server with WebSocket handling
├── basic-session.test.js  # Basic session API tests
└── index.test.js         # Integration tests
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
└── tests/                           # Component tests
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

## 🧪 Testing

The project follows Test-Driven Development (TDD) with comprehensive test coverage:

### Test Suites

```bash
# Server Tests (30 tests)
npm test

# Client Tests (70+ tests) 
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

### Test Coverage

- **Server**: Session management, WebSocket handling, PTY integration
- **Client**: Terminal functionality, session UI, reconnection logic
- **Critical Paths**: Session persistence, input handling, buffer management

## 🛠️ Development

### Development Workflow (TDD)

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
├── README.md                 # This file
├── CLAUDE.md                # Developer documentation
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
PORT=3001                    # Server port (default: 3001)
NODE_ENV=production         # Environment mode

# Client configuration  
REACT_APP_WS_URL=ws://localhost:3001  # WebSocket URL
```

### Server Settings

- **Port**: 3001 (configurable via PORT environment variable)
- **Session Timeout**: 2 minutes for inactive sessions
- **Buffer Limit**: 50KB per session terminal buffer
- **Cleanup Interval**: 10 seconds for session maintenance

## 🚨 Troubleshooting

### Common Issues

**Server won't start:**
```bash
# Check if port 3001 is available
lsof -i :3001

# Ensure Claude CLI is installed
which claude
```

**WebSocket connection fails:**
```bash
# Verify server is running
curl http://localhost:3001/api/sessions

# Check firewall/proxy settings
```

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
- **Documentation**: Update README/CLAUDE.md if needed

### Bug Reports

When reporting bugs, please include:
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Browser/Node.js versions**
- **Console logs/error messages**

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Claude Code CLI**: The underlying Claude Code command-line interface
- **xterm.js**: Professional terminal emulator for the web
- **node-pty**: Pseudo terminal bindings for Node.js
- **React**: User interface library
- **Express.js**: Web application framework

## 📞 Support

- **Documentation**: See [CLAUDE.md](CLAUDE.md) for detailed development guidance
- **Issues**: Submit bug reports and feature requests via GitHub Issues
- **Development**: Follow the TDD workflow documented in CLAUDE.md

---

**Built with ❤️ for seamless Claude Code interaction in the browser**
