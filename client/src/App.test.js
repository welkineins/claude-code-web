import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from './App';

// Mock WebSocket
class MockWebSocket {
  static instances = [];
  
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    
    MockWebSocket.instances.push(this);
    
    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 50);
  }

  send(data) {
    this.lastSent = data;
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  // Helper method to simulate receiving messages
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

global.WebSocket = MockWebSocket;
MockWebSocket.mock = { instances: MockWebSocket.instances };

// Mock the Terminal component
jest.mock('./components/Terminal', () => {
  return function MockTerminal({ messages, onInput, onResize, currentSessionId }) {
    return (
      <div data-testid="terminal">
        <div data-testid="session-id">{currentSessionId}</div>
        <div data-testid="message-count">{messages.length}</div>
        <button 
          data-testid="simulate-input" 
          onClick={() => onInput && onInput('test input')}
        >
          Simulate Input
        </button>
        <button 
          data-testid="simulate-resize" 
          onClick={() => onResize && onResize(100, 30)}
        >
          Simulate Resize
        </button>
      </div>
    );
  };
});

// Mock other components
jest.mock('./components/PathInput', () => {
  return function MockPathInput({ onStartSession }) {
    return (
      <div data-testid="path-input">
        <button 
          data-testid="start-session" 
          onClick={() => onStartSession('/test/path')}
        >
          Start Session
        </button>
      </div>
    );
  };
});

jest.mock('./components/SessionList', () => {
  return function MockSessionList({ onSelectSession, onNewSession }) {
    return (
      <div data-testid="session-list">
        <button 
          data-testid="select-session" 
          onClick={() => onSelectSession('test-session', '/test/path')}
        >
          Select Session
        </button>
        <button 
          data-testid="new-session" 
          onClick={() => onNewSession()}
        >
          New Session
        </button>
      </div>
    );
  };
});

describe('App Component', () => {
  let mockWebSocket;

  beforeEach(() => {
    jest.clearAllMocks();
    MockWebSocket.instances.length = 0; // Clear instances array
    mockWebSocket = null;
  });

  afterEach(() => {
    if (mockWebSocket) {
      mockWebSocket.close();
    }
  });

  describe('WebSocket Connection', () => {
    test('should establish WebSocket connection on mount', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });
    });

    test('should show disconnected status when WebSocket fails', async () => {
      // Mock WebSocket to fail immediately
      global.WebSocket = class extends MockWebSocket {
        constructor(url) {
          super(url);
          setTimeout(() => {
            this.readyState = WebSocket.CLOSED;
            if (this.onerror) this.onerror(new Error('Connection failed'));
            if (this.onclose) this.onclose();
          }, 50);
        }
      };

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Disconnected')).toBeInTheDocument();
      });
    });
  });

  describe('Session Management', () => {
    test('should start a new session when requested', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const startButton = screen.getByTestId('start-session');
      fireEvent.click(startButton);

      await waitFor(() => {
        expect(screen.getByTestId('terminal')).toBeInTheDocument();
      });
    });

    test('should handle session-started message correctly', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      // Get the WebSocket instance
      const ws = global.WebSocket.mock.instances[0];
      
      // Simulate session-started message
      ws.simulateMessage({
        type: 'session-started',
        sessionId: 'test-session-123'
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('test-session-123');
      });
    });

    test('should handle session reconnection correctly', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Simulate session reconnection
      ws.simulateMessage({
        type: 'session-reconnected',
        sessionId: 'reconnected-session',
        workingDir: '/test/dir'
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('reconnected-session');
      });
    });
  });

  describe('Buffer Restoration (Critical Regression Test)', () => {
    test('should handle buffer-restore message with proper timing', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Simulate buffer-restore message (this was the problematic case)
      ws.simulateMessage({
        type: 'buffer-restore',
        sessionId: 'restored-session',
        data: 'restored buffer content'
      });

      // Should immediately set messages
      await waitFor(() => {
        expect(screen.getByTestId('message-count')).toHaveTextContent('1');
      });

      // Should set currentSessionId after delay
      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('restored-session');
        expect(consoleSpy).toHaveBeenCalledWith(
          'Setting currentSessionId after buffer-restore delay: restored-session'
        );
      }, { timeout: 3000 });

      consoleSpy.mockRestore();
    });

    test('should not add buffer-restore message to messages after currentSessionId delay', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Simulate buffer-restore
      ws.simulateMessage({
        type: 'buffer-restore',
        sessionId: 'test-session',
        data: 'buffer data'
      });

      // Add another message after buffer-restore
      ws.simulateMessage({
        type: 'output',
        data: 'new output'
      });

      await waitFor(() => {
        // Should have buffer-restore message + new output message
        expect(screen.getByTestId('message-count')).toHaveTextContent('2');
      });
    });
  });

  describe('Input and Resize Handling', () => {
    test('should send input to WebSocket when terminal generates input', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Set up a session first
      ws.simulateMessage({
        type: 'session-started',
        sessionId: 'test-session'
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('test-session');
      });

      // Simulate terminal input
      const inputButton = screen.getByTestId('simulate-input');
      fireEvent.click(inputButton);

      expect(ws.lastSent).toEqual(JSON.stringify({
        type: 'input',
        input: 'test input',
        sessionId: 'test-session'
      }));
    });

    test('should send resize to WebSocket when terminal resizes', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Set up a session first
      ws.simulateMessage({
        type: 'session-started',
        sessionId: 'test-session'
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('test-session');
      });

      // Simulate terminal resize
      const resizeButton = screen.getByTestId('simulate-resize');
      fireEvent.click(resizeButton);

      expect(ws.lastSent).toEqual(JSON.stringify({
        type: 'resize',
        cols: 100,
        rows: 30,
        sessionId: 'test-session'
      }));
    });

    test('should not send input when no active session', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Try to send input without a session
      const inputButton = screen.getByTestId('simulate-input');
      fireEvent.click(inputButton);

      expect(consoleSpy).toHaveBeenCalledWith(
        'No active session - ignoring input: "test input"'
      );
      expect(ws.lastSent).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('Session Navigation', () => {
    test('should switch between path input and session list views', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByTestId('path-input')).toBeInTheDocument();
      });

      // Click Active Sessions to show session list
      const activeSessionsButton = screen.getByText('Active Sessions');
      fireEvent.click(activeSessionsButton);

      expect(screen.getByTestId('session-list')).toBeInTheDocument();
      expect(screen.queryByTestId('path-input')).not.toBeInTheDocument();

      // Click New Session to go back
      const newSessionButton = screen.getByText('New Session');
      fireEvent.click(newSessionButton);

      expect(screen.getByTestId('path-input')).toBeInTheDocument();
      expect(screen.queryByTestId('session-list')).not.toBeInTheDocument();
    });

    test('should handle session selection from session list', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      // Go to session list
      const activeSessionsButton = screen.getByText('Active Sessions');
      fireEvent.click(activeSessionsButton);

      const ws = global.WebSocket.mock.instances[0];
      
      // Select a session
      const selectSessionButton = screen.getByTestId('select-session');
      fireEvent.click(selectSessionButton);

      expect(ws.lastSent).toEqual(JSON.stringify({
        type: 'reconnect-session',
        sessionId: 'test-session'
      }));
    });
  });

  describe('Message Processing Edge Cases', () => {
    test('should handle unknown message types gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Send malformed message
      if (ws.onmessage) {
        ws.onmessage({ data: 'invalid json' });
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error parsing WebSocket message:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    test('should handle pong messages correctly', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Send pong message
      ws.simulateMessage({
        type: 'pong'
      });

      // Should not add pong to messages
      expect(screen.getByTestId('message-count')).toHaveTextContent('0');
    });
  });

  describe('Critical Regression Tests for Input After Reconnection', () => {
    test('should maintain input functionality after buffer-restore sequence', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Simulate full reconnection sequence
      ws.simulateMessage({
        type: 'session-reconnected',
        sessionId: 'reconnected-session',
        workingDir: '/test'
      });

      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('reconnected-session');
      });

      // Simulate buffer-restore
      ws.simulateMessage({
        type: 'buffer-restore',
        sessionId: 'reconnected-session',
        data: 'restored content'
      });

      // Wait for currentSessionId to be set after delay
      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('reconnected-session');
      }, { timeout: 3000 });

      // Test that input still works after buffer-restore
      const inputButton = screen.getByTestId('simulate-input');
      fireEvent.click(inputButton);

      expect(ws.lastSent).toEqual(JSON.stringify({
        type: 'input',
        input: 'test input',
        sessionId: 'reconnected-session'
      }));
    });

    test('should handle multiple rapid buffer-restore messages', async () => {
      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Status: Connected')).toBeInTheDocument();
      });

      const ws = global.WebSocket.mock.instances[0];
      
      // Send multiple buffer-restore messages rapidly
      ws.simulateMessage({
        type: 'buffer-restore',
        sessionId: 'session-1',
        data: 'buffer 1'
      });

      ws.simulateMessage({
        type: 'buffer-restore',
        sessionId: 'session-2',
        data: 'buffer 2'
      });

      // Should process the last one
      await waitFor(() => {
        expect(screen.getByTestId('session-id')).toHaveTextContent('session-2');
      }, { timeout: 3000 });
    });
  });
});