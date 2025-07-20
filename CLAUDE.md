# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Web UI - A web interface for Claude Code CLI with bi-directional streaming support. Users can enter a path and start a Claude Code CLI session on the server, with real-time streaming of input/output between the web interface and CLI.

## Development Approach

**IMPORTANT**: Always follow Test-Driven Development (TDD) principles:

1. **Red → Green → Refactor** cycle
2. Write failing tests first before implementing features
3. Write minimum code to make tests pass
4. Refactor only when tests are green
5. Run full test suite before committing changes

## Development Commands

```bash
# Install dependencies
npm install
cd client && npm install

# Build for production (server will restart automatically)
npm run build

# Run development server (both backend and frontend)
npm run dev

# Run only backend server
npm run server

# Run only frontend
npm run client

# Start production server
npm start

# Run tests (CRITICAL: Always run before committing)
npm test                    # Server-side tests
cd client && npm test       # Client-side tests

# Run linter
npm run lint
```

## Development Workflow

**Standard Development Process:**

1. **Write Tests First** (TDD Red phase)
   - Create failing tests for new functionality
   - Ensure tests fail for the right reasons

2. **Implement Minimum Code** (TDD Green phase)
   - Write only enough code to make tests pass
   - Avoid over-engineering

3. **Build & Test** (Validation phase)
   ```bash
   npm run build              # Build production assets (server auto-restarts)
   npm test                   # Run server tests (must pass)
   cd client && npm test      # Run client tests (must pass)
   ```

4. **Fix Issues** (if tests fail)
   - Address failing tests immediately
   - Run build + test cycle again
   - Never commit with failing tests

5. **Refactor** (TDD Refactor phase)
   - Clean up code while keeping tests green
   - Run tests after each refactoring step
   - Always validate with full build + test cycle

6. **Commit Changes**
   - Only commit when ALL tests pass
   - Build must succeed without errors
   - Use descriptive commit messages

**Server Management**: 
- Server starts manually by user: `npm run server` or `npm run dev`
- After `npm run build`, server restarts automatically
- If server doesn't restart automatically, ask user to restart it manually
- Always run `npm run build` before testing to ensure latest code

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

## Testing Strategy

**Comprehensive Test Coverage (100+ tests)**:

- **Server Tests**: `npm test` (30 tests)
  - Basic session management (`server/basic-session.test.js`) - 17 tests
  - Server integration tests (`server/index.test.js`) - 13 tests
  - API endpoints, session lifecycle, and cleanup

- **Client Tests**: `cd client && npm test` (70+ tests)
  - App component WebSocket logic (`src/App.test.js`)
  - Terminal component & reconnection (`src/components/Terminal.test.js`)
  - Session list UI & interactions (`src/components/SessionList.test.js`)
  - Path input validation (`src/components/PathInput.test.js`)

**Critical Regression Tests**:
- Terminal input functionality after session reconnection
- Buffer restoration and handler setup
- Multi-session switching and management

**Before Every Commit**:
```bash
# MANDATORY: Complete validation cycle
npm run build              # Must succeed (build validation + server restart)
npm test                   # Must pass (30 server tests)
cd client && npm test       # Must pass (70+ client tests)
npm run lint              # Must pass (code quality)
```

## Development Notes

- **ALWAYS follow TDD**: Write tests first, then implement
- **Build-first workflow**: ALWAYS run `npm run build` before testing
- **Never commit failing tests**: All tests must be green
- **Server management**: User starts server manually, build triggers auto-restart
- **Port allocation**: Backend (3001), Frontend (3000)
- **WebSocket connection**: Established on server startup
- **Test-first mindset**: Every feature needs corresponding tests

## Critical Workflow Reminders

**Before Every Code Change:**
1. Start with failing test (Red phase)
2. Write minimal implementation (Green phase)
3. **MANDATORY**: `npm run build` (ensures latest code + server restart)
4. **MANDATORY**: `npm test` (server tests must pass)
5. **MANDATORY**: `cd client && npm test` (client tests must pass)
6. If ANY test fails, fix immediately and repeat steps 3-5
7. Only commit when ALL tests pass

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

## Test-Driven Development Guidelines

### Writing Tests (Red Phase)
```bash
# 1. Create failing test for new feature
cd client && npm test -- --testNamePattern="new feature name"
# or for server tests
npm test server/new-feature.test.js
```

### Implementation (Green Phase)
```bash
# 2. Write minimal code to pass tests
# 3. Verify tests pass
npm test && cd client && npm test
```

### Validation (Build & Test)
```bash
# 4. CRITICAL: Always run full build and test cycle before committing
npm run build              # Build must succeed (server auto-restarts)
npm test                   # Server tests must pass (30 tests)
cd client && npm test      # Client tests must pass (70+ tests)
npm run lint              # Linting must pass

# If tests fail:
npm run build              # Rebuild after fixes
npm test                   # Retest server
cd client && npm test      # Retest client
```

### Test Categories
- **Unit Tests**: Individual component/function testing
- **Integration Tests**: Component interaction testing  
- **Regression Tests**: Prevention of known bug reoccurrence
- **API Tests**: Server endpoint validation
- **UI Tests**: User interaction workflows

### Test Maintenance
- **Update tests** when changing functionality
- **Add regression tests** for every bug fix
- **Keep tests focused** and independent
- **Use descriptive test names** that explain the scenario