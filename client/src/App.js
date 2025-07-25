import React, { useState, useEffect, useRef, useCallback } from 'react';
import Terminal from './components/Terminal';
import PathInput from './components/PathInput';
import SessionList from './components/SessionList';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [showDirectoryCreated, setShowDirectoryCreated] = useState(false);
  const [messages, setMessages] = useState([]);
  const [showSessionList, setShowSessionList] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWebSocket = () => {
    // Use the current hostname but connect to WebSocket server on port 3001
    const wsUrl = `ws://${window.location.hostname}:3001`;
    console.log('Connecting to WebSocket server:', wsUrl);
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      console.log('Connected to WebSocket server');
      
      // Start ping/pong to keep connection alive
      const pingInterval = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 10000); // Ping every 10 seconds
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('App received message:', data);
        
        // Handle pong messages
        if (data.type === 'pong') {
          // Just log, no need to add to messages
          console.log('Received pong from server');
          return;
        }
        
        // Handle session reconnection
        if (data.type === 'session-reconnected') {
          console.log('Session reconnected:', data.sessionId, 'Working dir:', data.workingDir);
          console.log('Previous session was:', currentSessionId);
          setCurrentSessionId(data.sessionId);
          setCurrentPath(data.workingDir);
          setSessionActive(true);
          // Clear messages to prepare for fresh session content
          setMessages([]);
          console.log('Messages cleared for session switch');
          return;
        }
        
        // Handle session started
        if (data.type === 'session-started') {
          console.log('Setting currentSessionId to:', data.sessionId);
          setCurrentSessionId(data.sessionId);
          return; // Don't add session-started to messages array
        }
        
        // Handle path info message
        if (data.type === 'path-info') {
          console.log('Received path info:', data);
          setCurrentPath(data.normalizedPath);
          // Only show directory created indicator if directory was actually created
          if (data.directoryCreated) {
            setShowDirectoryCreated(true);
            // Auto-hide after animation completes
            setTimeout(() => {
              setShowDirectoryCreated(false);
            }, 4000); // Match the CSS animation duration
          }
          return; // Don't add path-info to messages array
        }
        
        // Handle buffer restore for reconnection
        if (data.type === 'buffer-restore') {
          console.log('Restoring terminal buffer for session:', data.sessionId);
          // Add the buffer restore message to the messages array - Terminal.js will handle it
          setMessages([data]);
          // CRITICAL: Set currentSessionId AFTER buffer-restore to ensure terminal is ready for handlers
          setTimeout(() => {
            console.log('Setting currentSessionId after buffer-restore delay:', data.sessionId);
            setCurrentSessionId(data.sessionId);
          }, 200); // Increased delay to ensure terminal is fully ready
          return;
        }
        
        setMessages(prev => [...prev, data]);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    wsRef.current.onclose = () => {
      setIsConnected(false);
      setSessionActive(false);
      console.log('Disconnected from WebSocket server');
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const startSession = (path) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('Starting new session with path:', path);
      
      // Clear everything for new session
      setCurrentPath(path);
      setCurrentSessionId(null); // This will be set when session-started is received
      setShowDirectoryCreated(false); // Clear directory created indicator
      setMessages([]);
      
      const message = {
        type: 'start-session',
        path: path
      };
      console.log('Sending start-session message:', message);
      wsRef.current.send(JSON.stringify(message));
      setSessionActive(true);
      setShowSessionList(false);
      setShowMobileMenu(false);
    } else {
      console.error('WebSocket not connected');
    }
  };

  const reconnectToSession = (sessionId, workingDir) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('Switching to session:', sessionId);
      
      // Clear messages first to avoid display issues
      setMessages([]);
      
      // Update current session info
      setCurrentSessionId(sessionId);
      setCurrentPath(workingDir);
      
      const message = {
        type: 'reconnect-session',
        sessionId: sessionId
      };
      console.log('Sending reconnect-session message:', message);
      wsRef.current.send(JSON.stringify(message));
      setSessionActive(true);
      setShowSessionList(false);
      setShowMobileMenu(false);
    } else {
      console.error('WebSocket not connected');
    }
  };

  const showSessions = () => {
    setShowSessionList(true);
    setSessionActive(false);
    setShowMobileMenu(false);
  };

  const showNewSession = () => {
    setShowSessionList(false);
    setSessionActive(false);
    setShowMobileMenu(false);
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  const sendInput = useCallback((input) => {
    console.log('sendInput called with currentSessionId:', currentSessionId, 'input:', JSON.stringify(input));
    if (!currentSessionId) {
      console.warn('No active session - ignoring input:', JSON.stringify(input));
      return;
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending input to session:', currentSessionId, JSON.stringify(input));
      wsRef.current.send(JSON.stringify({
        type: 'input',
        input: input,
        sessionId: currentSessionId
      }));
    } else {
      console.error('WebSocket not connected for input');
    }
  }, [currentSessionId]);

  const sendResize = useCallback((cols, rows) => {
    if (!currentSessionId) {
      console.warn('No active session - ignoring resize:', cols, 'x', rows);
      return;
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending resize to session:', currentSessionId, cols, 'x', rows);
      wsRef.current.send(JSON.stringify({
        type: 'resize',
        cols: cols,
        rows: rows,
        sessionId: currentSessionId
      }));
    } else {
      console.error('WebSocket not connected for resize');
    }
  }, [currentSessionId]);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Claude Code Web</h1>
        <div className="header-controls desktop">
          <button onClick={showNewSession} className="header-button" title="New Session">
            <span className="button-text">New Session</span>
            <span className="button-icon">➕</span>
          </button>
          <button onClick={showSessions} className="header-button" title="Active Sessions">
            <span className="button-text">Active Sessions</span>
            <span className="button-icon">📋</span>
          </button>
          <div className="connection-status" title={isConnected ? 'Connected' : 'Disconnected'}>
            <span className="status-text">Status: {isConnected ? 'Connected' : 'Disconnected'}</span>
            <span className="status-icon">{isConnected ? '🟢' : '🔴'}</span>
          </div>
        </div>
        
        <button className="mobile-menu-button" onClick={toggleMobileMenu}>
          <span className="menu-icon">☰</span>
        </button>
        
        {showMobileMenu && (
          <div className="mobile-menu-overlay" onClick={toggleMobileMenu}>
            <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
              <div className="mobile-menu-header">
                <h3>Menu</h3>
                <button className="close-menu" onClick={toggleMobileMenu}>✕</button>
              </div>
              <div className="mobile-menu-items">
                <button onClick={showNewSession} className="mobile-menu-item">
                  <span className="menu-item-icon">➕</span>
                  <span className="menu-item-text">New Session</span>
                </button>
                <button onClick={showSessions} className="mobile-menu-item">
                  <span className="menu-item-icon">📋</span>
                  <span className="menu-item-text">Active Sessions</span>
                </button>
                <div className="mobile-menu-status">
                  <span className="menu-item-icon">{isConnected ? '🟢' : '🔴'}</span>
                  <span className="menu-item-text">Status: {isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
      
      <main className="App-main">
        {showSessionList ? (
          <SessionList 
            onSelectSession={reconnectToSession}
            onNewSession={showNewSession}
          />
        ) : !sessionActive ? (
          <PathInput onStartSession={startSession} />
        ) : (
          <div className="terminal-container">
            <div className="session-info">
              <div className="session-id">Session {currentSessionId || 'active'}</div>
              <div className="session-path">
                Working Directory: <strong>{currentPath || 'current directory'}</strong>
                {showDirectoryCreated && (
                  <div className="path-details">
                    <span className="path-detail created">✅ Directory Created</span>
                  </div>
                )}
              </div>
            </div>
            <Terminal
              messages={messages}
              onInput={sendInput}
              onResize={sendResize}
              currentSessionId={currentSessionId}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;