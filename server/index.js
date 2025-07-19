const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('node-pty');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API endpoint to list active sessions
app.get('/api/sessions', (req, res) => {
  const activeSessions = [];
  
  allSessions.forEach((session, sessionId) => {
    if (session.ptyProcess && !session.ptyProcess.killed) {
      // Find if any WebSocket is connected to this session
      let isConnected = false;
      let lastSeen = session.createdAt;
      
      wsSessions.forEach((sessionIds, ws) => {
        if (sessionIds.includes(sessionId) && ws.readyState === 1) {
          isConnected = true;
          lastSeen = ws.lastSeen || session.createdAt;
        }
      });
      
      activeSessions.push({
        sessionId: session.sessionId,
        workingDir: session.workingDir,
        createdAt: session.createdAt,
        lastActive: lastSeen,
        isConnected: isConnected,
        hasBuffer: session.terminalBuffer && session.terminalBuffer.length > 0,
        bufferSize: session.terminalBuffer ? session.terminalBuffer.length : 0
      });
    }
  });
  
  res.json(activeSessions);
});

// API endpoint to reconnect to a session
app.post('/api/sessions/:sessionId/reconnect', (req, res) => {
  const { sessionId } = req.params;
  
  // Find the session
  const foundSession = allSessions.get(sessionId);
  
  if (foundSession && foundSession.ptyProcess && !foundSession.ptyProcess.killed) {
    res.json({ 
      success: true, 
      sessionId: sessionId,
      workingDir: foundSession.workingDir,
      message: 'Session found and ready for reconnection' 
    });
  } else {
    res.status(404).json({ 
      success: false, 
      message: 'Session not found or terminated' 
    });
  }
});

// Serve static files from the React app build directory
const buildPath = path.join(__dirname, '../client/build');
app.use(express.static(buildPath));

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocket.Server({ server });

// Store sessions by sessionId instead of by WebSocket connection
const allSessions = new Map(); // sessionId -> session data
const wsSessions = new Map(); // ws -> array of sessionIds

wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');
  
  // Add connection tracking
  ws.isAlive = true;
  ws.lastSeen = Date.now();
  
  // Initialize session tracking for this WebSocket
  wsSessions.set(ws, []);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received WebSocket message:', data.type, data);
      
      // Update last seen time
      ws.lastSeen = Date.now();
      ws.isAlive = true;
      
      switch (data.type) {
        case 'start-session':
          startClaudeCodeSession(ws, data.path);
          break;
        case 'reconnect-session':
          reconnectToSession(ws, data.sessionId);
          break;
        case 'input':
          console.log(`🔴 INPUT EVENT: sessionId=${data.sessionId}, input=${JSON.stringify(data.input)}`);
          handleInput(ws, data.input, data.sessionId);
          break;
        case 'resize':
          console.log(`🔴 RESIZE EVENT: sessionId=${data.sessionId}, cols=${data.cols}, rows=${data.rows}`);
          handleResize(ws, data.cols, data.rows, data.sessionId);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    ws.isAlive = false;
    
    // Start 2-minute timeout for reconnection
    setTimeout(() => {
      if (!ws.isAlive) {
        console.log('WebSocket did not reconnect within 2 minutes, cleaning up session');
        cleanupSession(ws);
      }
    }, 120000);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    ws.isAlive = false;
  });
});

// Periodic cleanup of stale sessions
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 120000; // 2 minutes
  
  // Check all sessions for staleness
  allSessions.forEach((session, sessionId) => {
    if (session.ptyProcess && !session.ptyProcess.killed) {
      // Check if any connected WebSocket has seen this session recently
      let hasActiveConnection = false;
      
      wsSessions.forEach((sessionIds, ws) => {
        if (sessionIds.includes(sessionId) && ws.lastSeen && (now - ws.lastSeen) <= staleThreshold) {
          hasActiveConnection = true;
        }
      });
      
      // If no active connections for this session, clean it up
      if (!hasActiveConnection) {
        console.log(`Session ${sessionId} is stale (no active connections), cleaning up`);
        cleanupSessionById(sessionId);
      }
    }
  });
}, 10000); // Check every 10 seconds

function reconnectToSession(ws, sessionId) {
  try {
    // Find the existing session
    const foundSession = allSessions.get(sessionId);
    
    if (!foundSession || !foundSession.ptyProcess || foundSession.ptyProcess.killed) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Session not found or terminated' 
      }));
      return;
    }
    
    console.log(`Reconnecting to session ${sessionId}`);
    
    // Add this session to the WebSocket's session list
    const currentSessions = wsSessions.get(ws) || [];
    if (!currentSessions.includes(sessionId)) {
      currentSessions.push(sessionId);
      wsSessions.set(ws, currentSessions);
    }
    
    // Update the session's current WebSocket
    foundSession.currentWs = ws;
    foundSession.bufferTimer = null; // Reset buffer timer
    
    // Send reconnection success first
    ws.send(JSON.stringify({ 
      type: 'session-reconnected', 
      sessionId: sessionId,
      workingDir: foundSession.workingDir
    }));
    
    // SIMPLE APPROACH: Clear terminal and refresh current status instead of complex buffer management
    console.log(`Session ${sessionId} reconnected - clearing terminal and refreshing current status`);
    
    // Set up event handlers first
    setupSessionEventHandlers(ws, foundSession);
    
    // Send a clear terminal signal to frontend
    ws.send(JSON.stringify({ 
      type: 'terminal-refresh',
      sessionId: sessionId
    }));
    
    // Send a simple refresh command to the PTY to show current status
    // This will naturally display the current Claude Code state
    setTimeout(() => {
      if (foundSession.ptyProcess && !foundSession.ptyProcess.killed) {
        // Send Ctrl+C followed by Enter to refresh the prompt cleanly
        foundSession.ptyProcess.write('\x03\r');
        console.log(`Session ${sessionId} terminal refreshed with current status`);
      }
    }, 200); // Small delay to ensure terminal is ready
    
    console.log(`Session ${sessionId} reconnected successfully`);
    
  } catch (error) {
    console.error('Error reconnecting to session:', error);
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Failed to reconnect to session: ' + error.message 
    }));
  }
}

function startClaudeCodeSession(ws, workingDir) {
  try {
    const sessionId = generateSessionId();
    const cwd = workingDir || process.cwd();
    const createdAt = new Date().toISOString();
    
    console.log(`Starting Claude Code session ${sessionId} in directory: ${cwd}`);
    
    // Check if claude command exists first
    const { exec } = require('child_process');
    exec('which claude', (error, stdout, stderr) => {
      if (error) {
        console.error('Claude command not found:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Claude CLI not found. Please install Claude Code CLI first.' 
        }));
        return;
      }
      console.log('Claude CLI found at:', stdout.trim());
    });
    
    // Spawn Claude Code CLI directly with proper terminal settings
    const ptyProcess = spawn('claude', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_COLOR: '1'
      }
    });
    
    console.log(`PTY process spawned for session ${sessionId}`);
    
    // Add buffering for rapid updates
    let outputBuffer = '';
    let bufferTimer = null;
    
    const sessionData = { 
      sessionId, 
      ptyProcess, 
      bufferTimer,
      workingDir: cwd,
      createdAt: createdAt,
      terminalBuffer: '', // Each session has its own independent buffer
      lastBufferUpdate: Date.now(),
      currentWs: ws,
      handlersSetup: false // Track if handlers are already set up
    };
    
    // Store session in global sessions map
    allSessions.set(sessionId, sessionData);
    
    // Add session to this WebSocket's session list
    const currentSessions = wsSessions.get(ws) || [];
    currentSessions.push(sessionId);
    wsSessions.set(ws, currentSessions);
    
    // Set up event handlers
    setupSessionEventHandlers(ws, sessionData);
    
    ws.send(JSON.stringify({ type: 'session-started', sessionId }));
    console.log(`Session ${sessionId} started successfully`);
    
  } catch (error) {
    console.error('Error starting Claude Code session:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to start Claude Code session: ' + error.message }));
  }
}

function setupSessionEventHandlers(ws, session) {
  const { sessionId, ptyProcess } = session;
  
  // Check if handlers are already set up for this session
  if (session.handlersSetup) {
    console.log(`Session ${sessionId} handlers already set up, just updating WebSocket`);
    session.currentWs = ws;
    return;
  }
  
  let outputBuffer = '';
  let bufferTimer = null;
  
  // CRITICAL: Remove all existing listeners to prevent duplication
  console.log(`Setting up event handlers for session ${sessionId} - removing existing listeners first`);
  ptyProcess.removeAllListeners('data');
  ptyProcess.removeAllListeners('exit');
  
  // Mark handlers as set up
  session.handlersSetup = true;
  
  const flushBuffer = () => {
    if (outputBuffer && session.currentWs && session.currentWs.readyState === 1) {
      console.log(`Session ${sessionId} sending ${outputBuffer.length} bytes to WebSocket`);
      session.currentWs.send(JSON.stringify({ type: 'output', data: outputBuffer }));
      
      // Don't store control sequences in buffer - let frontend handle buffer persistence
      // We'll only use the buffer for reconnection, and let the frontend manage it
      session.lastBufferUpdate = Date.now();
      
      outputBuffer = '';
    }
    bufferTimer = null;
    session.bufferTimer = null;
  };
  
  ptyProcess.on('data', (data) => {
    const output = data.toString();
    console.log(`Session ${sessionId} output (${output.length} bytes)`);
    
    // Log important control sequences for debugging
    if (output.includes('\x1b[2J')) {
      console.log(`Session ${sessionId}: Screen clear sequence`);
    }
    
    if (session.currentWs && session.currentWs.readyState === 1) { // WebSocket.OPEN
      // Add to buffer
      outputBuffer += output;
      
      // CRITICAL: Also update the session's persistent terminal buffer
      session.terminalBuffer += output;
      session.lastBufferUpdate = Date.now();
      
      // Keep buffer size manageable (last 50KB of output)
      if (session.terminalBuffer.length > 50000) {
        session.terminalBuffer = session.terminalBuffer.slice(-50000);
      }
      
      // Clear existing timer and set new one
      if (bufferTimer) {
        clearTimeout(bufferTimer);
      }
      
      // For screen clearing sequences, flush immediately
      if (output.includes('\x1b[2J') || output.includes('\x1b[H')) {
        console.log(`Flushing immediately due to screen clear/home`);
        flushBuffer();
      } else {
        // Buffer output for smooth updates
        bufferTimer = setTimeout(flushBuffer, 16); // ~60fps for responsive feel
        session.bufferTimer = bufferTimer;
      }
    } else {
      console.error(`WebSocket not ready for session ${sessionId}, state: ${session.currentWs ? session.currentWs.readyState : 'no ws'}`);
    }
  });
  
  ptyProcess.on('exit', (code) => {
    console.log(`Session ${sessionId} exited with code:`, code);
    if (session.currentWs && session.currentWs.readyState === 1) {
      session.currentWs.send(JSON.stringify({ type: 'exit', code }));
    }
    // Clean up the session
    cleanupSessionById(sessionId);
  });
  
  ptyProcess.on('error', (error) => {
    console.error(`Session ${sessionId} error:`, error);
    if (session.currentWs && session.currentWs.readyState === 1) {
      session.currentWs.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });
}

function handleInput(ws, input, targetSessionId) {
  if (targetSessionId) {
    // Send input to specific session
    const session = allSessions.get(targetSessionId);
    if (session && session.ptyProcess && !session.ptyProcess.killed) {
      console.log(`Session ${targetSessionId} input:`, JSON.stringify(input));
      session.ptyProcess.write(input);
      return;
    } else {
      console.warn(`Target session ${targetSessionId} not found or not active`);
      return;
    }
  }
  
  // Fallback: Find any active session for this WebSocket
  const sessionIds = wsSessions.get(ws) || [];
  let activeSession = null;
  for (const sessionId of sessionIds) {
    const session = allSessions.get(sessionId);
    if (session && session.ptyProcess && !session.ptyProcess.killed && session.currentWs === ws) {
      activeSession = session;
      break;
    }
  }
  
  if (activeSession && activeSession.ptyProcess) {
    console.log(`Session ${activeSession.sessionId} input (fallback):`, JSON.stringify(input));
    activeSession.ptyProcess.write(input);
  } else {
    console.warn('No active session found for input');
  }
}

function handleResize(ws, cols, rows, targetSessionId) {
  if (targetSessionId) {
    // Resize specific session
    const session = allSessions.get(targetSessionId);
    if (session && session.ptyProcess && !session.ptyProcess.killed) {
      console.log(`Session ${targetSessionId} resize: ${cols}x${rows}`);
      try {
        session.ptyProcess.resize(cols, rows);
        console.log(`Successfully resized PTY for session ${targetSessionId}`);
      } catch (error) {
        console.error(`Error resizing session ${targetSessionId}:`, error);
      }
      return;
    } else {
      console.warn(`Target session ${targetSessionId} not found or not active`);
      return;
    }
  }
  
  // Fallback: Find any active session for this WebSocket
  const sessionIds = wsSessions.get(ws) || [];
  let activeSession = null;
  for (const sessionId of sessionIds) {
    const session = allSessions.get(sessionId);
    if (session && session.ptyProcess && !session.ptyProcess.killed && session.currentWs === ws) {
      activeSession = session;
      break;
    }
  }
  
  if (activeSession && activeSession.ptyProcess) {
    console.log(`Session ${activeSession.sessionId} resize (fallback): ${cols}x${rows}`);
    try {
      activeSession.ptyProcess.resize(cols, rows);
      console.log(`Successfully resized PTY for session ${activeSession.sessionId}`);
    } catch (error) {
      console.error(`Error resizing session ${activeSession.sessionId}:`, error);
    }
  } else {
    console.warn('No active session found for resize');
  }
}

function cleanupSession(ws) {
  // Clean up all sessions associated with this WebSocket
  const sessionIds = wsSessions.get(ws) || [];
  
  for (const sessionId of sessionIds) {
    const session = allSessions.get(sessionId);
    if (session && session.currentWs === ws) {
      // Only cleanup if this WebSocket is the current owner
      cleanupSessionById(sessionId);
    }
  }
  
  // Remove WebSocket from tracking
  wsSessions.delete(ws);
}

function cleanupSessionById(sessionId) {
  const session = allSessions.get(sessionId);
  if (session && session.ptyProcess) {
    console.log(`Cleaning up session ${sessionId}`);
    
    // Clear any pending buffer timer
    if (session.bufferTimer) {
      clearTimeout(session.bufferTimer);
    }
    
    // Kill the Claude process
    if (!session.ptyProcess.killed) {
      session.ptyProcess.kill('SIGTERM');
      
      // Force kill if it doesn't terminate within 5 seconds
      setTimeout(() => {
        if (!session.ptyProcess.killed) {
          console.log(`Force killing session ${sessionId}`);
          session.ptyProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    // Remove session from global map
    allSessions.delete(sessionId);
    
    // Remove session from all WebSocket tracking
    wsSessions.forEach((sessionIds, ws) => {
      const index = sessionIds.indexOf(sessionId);
      if (index > -1) {
        sessionIds.splice(index, 1);
      }
    });
  } else {
    console.log(`No session ${sessionId} to cleanup`);
  }
}

function generateSessionId() {
  return Math.random().toString(36).substr(2, 9);
}

// Catch-all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Build not found. Please run: npm run build');
  }
});