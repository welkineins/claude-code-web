# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Web UI - A web interface for Claude Code CLI with bi-directional streaming support. Users can enter a path and start a Claude Code CLI session on the server, with real-time streaming of input/output between the web interface and CLI.

## Development Commands

```bash
# Install dependencies
npm install
cd client && npm install

# Run development server (both backend and frontend)
npm run dev

# Run only backend server
npm run server

# Run only frontend
npm run client

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run linter
npm run lint
```

## Architecture Overview

### Backend (Node.js + Express + WebSocket)
- **server/index.js**: Main server with WebSocket handling
- Uses `node-pty` to spawn Claude Code CLI processes
- Manages WebSocket connections and PTY sessions
- Handles session lifecycle (start/stop/cleanup)

### Frontend (React + xterm.js)
- **client/src/App.js**: Main application component
- **client/src/components/PathInput.js**: Initial path input UI
- **client/src/components/Terminal.js**: Terminal interface using xterm.js
- WebSocket client for real-time communication

### Key Components
- **Session Management**: Each WebSocket connection can spawn a Claude Code CLI session
- **PTY Integration**: Uses node-pty for proper terminal emulation  
- **Real-time Streaming**: Bi-directional data flow between web terminal and CLI
- **Path Selection**: Users can specify working directory for Claude Code session
- **Session Persistence**: Sessions persist when WebSocket disconnects, allowing reconnection within 2-minute timeout
- **Multiple Session Support**: Users can list active sessions and reconnect to existing ones

### Critical Architecture Details

#### Session Management System
- **Two-Map Architecture**: `allSessions` (sessionId → session data) and `wsSessions` (ws → sessionIds array)
- **Handler Deduplication**: `handlersSetup` flag prevents duplicate PTY event listeners during reconnection
- **Session Lifecycle**: PTY processes persist beyond WebSocket connections with cleanup after 2-minute timeout

#### Message Processing (Frontend)
- **Sequential Processing**: `processedMessagesRef` tracks processed message count to prevent infinite loops
- **Buffer Management**: Terminal buffer handled by xterm.js, not server-side content filtering
- **Input Guards**: Input/resize events blocked when `currentSessionId` is null

#### Data Flow
1. User enters path and starts session
2. Backend spawns Claude Code CLI with node-pty
3. PTY output streams to WebSocket → Frontend terminal (16ms buffering)
4. User input from terminal → WebSocket → PTY process (with session validation)
5. Terminal resize events propagated to PTY
6. Session disconnection triggers 2-minute cleanup timer

## Development Notes

- Follow test-driven development (TDD) principles
- Maintain clean code standards
- Ensure all tests pass before commits
- Use incremental development approach
- Backend runs on port 3001, frontend on port 3000
- WebSocket connection established on server startup

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

### Mobile Support
- **Responsive Design**: Mobile menu collapses header buttons on small screens
- **Touch Optimization**: Terminal sizing and interaction optimized for mobile devices