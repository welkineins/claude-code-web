import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Terminal from './Terminal';

// Create shared mock instance that will be used both in mock and tests
const createMockTerminal = () => ({
  open: jest.fn(),
  dispose: jest.fn(),
  write: jest.fn(),
  clear: jest.fn(),
  reset: jest.fn(),
  focus: jest.fn(),
  hasSelection: jest.fn().mockReturnValue(false),
  onData: jest.fn(),
  onResize: jest.fn(),
  element: { offsetHeight: 100, offsetWidth: 100 },
  cols: 80,
  rows: 24,
  loadAddon: jest.fn()
});

const mockTerminalInstance = createMockTerminal();

// Mock xterm and addons
jest.mock('xterm', () => ({
  Terminal: jest.fn(() => mockTerminalInstance)
}));

jest.mock('xterm-addon-fit', () => ({
  FitAddon: jest.fn().mockImplementation(() => ({
    fit: jest.fn()
  }))
}));

jest.mock('xterm-addon-web-links', () => ({
  WebLinksAddon: jest.fn().mockImplementation(() => ({}))
}));

describe('Terminal Component', () => {
  const mockOnInput = jest.fn();
  const mockOnResize = jest.fn();
  const defaultProps = {
    messages: [],
    onInput: mockOnInput,
    onResize: mockOnResize,
    currentSessionId: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock calls
    Object.values(mockTerminalInstance).forEach(mockFn => {
      if (typeof mockFn === 'function' && mockFn.mockClear) {
        mockFn.mockClear();
      }
    });
    // Reset specific terminal state
    mockTerminalInstance.cols = 80;
    mockTerminalInstance.rows = 24;
    mockTerminalInstance.element = { offsetHeight: 100, offsetWidth: 100 };
  });

  describe('Terminal Initialization', () => {
    test('should render terminal wrapper', () => {
      render(<Terminal {...defaultProps} />);
      expect(document.querySelector('.terminal-wrapper')).toBeInTheDocument();
    });

    test('should initialize xterm when component mounts', async () => {
      const { Terminal: XTermMock } = require('xterm');
      render(<Terminal {...defaultProps} />);
      
      await waitFor(() => {
        expect(XTermMock).toHaveBeenCalled();
      });
    });
  });

  describe('Session Reconnection and Input Handlers', () => {
    test('should set up input handlers when currentSessionId is provided', async () => {
      render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.onData).toHaveBeenCalled();
        expect(mockTerminalInstance.onResize).toHaveBeenCalled();
      });
    });

    test('should handle buffer-restore message correctly', async () => {
      const bufferRestoreMessage = {
        type: 'buffer-restore',
        sessionId: 'test-session',
        data: 'restored buffer content'
      };

      const { rerender } = render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      // Simulate buffer-restore message
      rerender(<Terminal {...defaultProps} currentSessionId="test-session" messages={[bufferRestoreMessage]} />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.clear).toHaveBeenCalled();
        expect(mockTerminalInstance.write).toHaveBeenCalledWith('restored buffer content');
      });
    });

    test('should manually set up handlers during buffer-restore', async () => {
      const bufferRestoreMessage = {
        type: 'buffer-restore',
        sessionId: 'test-session',
        data: 'buffer content'
      };

      const { rerender } = render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      // Clear previous calls
      mockTerminalInstance.onData.mockClear();
      mockTerminalInstance.onResize.mockClear();
      
      // Simulate buffer-restore with current session
      rerender(<Terminal {...defaultProps} currentSessionId="test-session" messages={[bufferRestoreMessage]} />);
      
      await waitFor(() => {
        // Should manually set up handlers during buffer-restore
        expect(mockTerminalInstance.onData).toHaveBeenCalled();
        expect(mockTerminalInstance.onResize).toHaveBeenCalled();
        expect(mockTerminalInstance.focus).toHaveBeenCalled();
      });
    });

    test('should process output messages correctly', async () => {
      const outputMessage = {
        type: 'output',
        data: 'terminal output data'
      };

      const { rerender } = render(<Terminal {...defaultProps} />);
      rerender(<Terminal {...defaultProps} messages={[outputMessage]} />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.write).toHaveBeenCalledWith('terminal output data');
      });
    });
  });

  describe('Handler Setup Edge Cases', () => {
    test('should not set up handlers when terminal is not ready', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping handler setup - terminal not ready or no session')
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle missing dependencies in buffer-restore', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const bufferRestoreMessage = {
        type: 'buffer-restore',
        sessionId: 'test-session',
        data: 'buffer content'
      };

      // Render without currentSessionId to simulate missing dependency
      const { rerender } = render(<Terminal {...defaultProps} />);
      rerender(<Terminal {...defaultProps} messages={[bufferRestoreMessage]} />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('BUFFER-RESTORE: Cannot set up handlers - missing dependencies')
        );
      });
      
      consoleSpy.mockRestore();
    });
  });

  describe('Message Processing', () => {
    test('should handle terminal-refresh message', async () => {
      const refreshMessage = {
        type: 'terminal-refresh',
        sessionId: 'test-session'
      };

      const { rerender } = render(<Terminal {...defaultProps} />);
      rerender(<Terminal {...defaultProps} messages={[refreshMessage]} />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.reset).toHaveBeenCalled();
        expect(mockTerminalInstance.clear).toHaveBeenCalled();
      });
    });

    test('should handle exit message', async () => {
      const exitMessage = {
        type: 'exit',
        code: 0
      };

      const { rerender } = render(<Terminal {...defaultProps} />);
      rerender(<Terminal {...defaultProps} messages={[exitMessage]} />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.write).toHaveBeenCalledWith(
          expect.stringContaining('[Process exited with code 0]')
        );
      });
    });

    test('should handle error message', async () => {
      const errorMessage = {
        type: 'error',
        message: 'Test error message'
      };

      const { rerender } = render(<Terminal {...defaultProps} />);
      rerender(<Terminal {...defaultProps} messages={[errorMessage]} />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.write).toHaveBeenCalledWith(
          expect.stringContaining('[Error: Test error message]')
        );
      });
    });
  });

  describe('Input Handler Functionality', () => {
    test('should call onInput callback when terminal data handler is triggered', async () => {
      render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.onData).toHaveBeenCalled();
      });

      // Get the data handler that was passed to onData
      const dataHandler = mockTerminalInstance.onData.mock.calls[0][0];
      
      // Simulate user input
      dataHandler('test input');
      
      expect(mockOnInput).toHaveBeenCalledWith('test input');
    });

    test('should call onResize callback when terminal resize handler is triggered', async () => {
      render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.onResize).toHaveBeenCalled();
      });

      // Get the resize handler that was passed to onResize
      const resizeHandler = mockTerminalInstance.onResize.mock.calls[0][0];
      
      // Simulate terminal resize
      resizeHandler({ cols: 100, rows: 30 });
      
      expect(mockOnResize).toHaveBeenCalledWith(100, 30);
    });
  });

  describe('Critical Regression Tests for Session Reconnection', () => {
    test('should ensure input handlers work after buffer-restore (regression test)', async () => {
      const bufferRestoreMessage = {
        type: 'buffer-restore',
        sessionId: 'test-session',
        data: 'restored content'
      };

      // Initial render with session
      const { rerender } = render(<Terminal {...defaultProps} currentSessionId="test-session" />);
      
      // Clear previous handler setup calls
      mockTerminalInstance.onData.mockClear();
      mockOnInput.mockClear();
      
      // Simulate buffer-restore (this is where the bug was)
      rerender(<Terminal {...defaultProps} currentSessionId="test-session" messages={[bufferRestoreMessage]} />);
      
      await waitFor(() => {
        // Verify handlers are manually set up during buffer-restore
        expect(mockTerminalInstance.onData).toHaveBeenCalled();
      });

      // Get the manually set up data handler
      const manualDataHandler = mockTerminalInstance.onData.mock.calls[0][0];
      
      // Test that input works after buffer-restore
      manualDataHandler('input after reconnect');
      
      expect(mockOnInput).toHaveBeenCalledWith('input after reconnect');
    });

    test('should maintain session ID consistency during buffer-restore', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const bufferRestoreMessage = {
        type: 'buffer-restore',
        sessionId: 'test-session-123',
        data: 'buffer content'
      };

      const { rerender } = render(<Terminal {...defaultProps} currentSessionId="test-session-123" />);
      rerender(<Terminal {...defaultProps} currentSessionId="test-session-123" messages={[bufferRestoreMessage]} />);
      
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('🔴 BUFFER-RESTORE: Forcing handler setup for session: test-session-123')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('🔴 BUFFER-RESTORE: Setting up handlers manually for session: test-session-123')
        );
      });
      
      consoleSpy.mockRestore();
    });

    test('should handle rapid session switching correctly', async () => {
      const { rerender } = render(<Terminal {...defaultProps} currentSessionId="session-1" />);
      
      await waitFor(() => {
        expect(mockTerminalInstance.onData).toHaveBeenCalled();
      });

      // Clear calls
      mockTerminalInstance.onData.mockClear();
      
      // Switch to different session
      rerender(<Terminal {...defaultProps} currentSessionId="session-2" />);
      
      await waitFor(() => {
        // Should set up handlers for new session
        expect(mockTerminalInstance.onData).toHaveBeenCalled();
      });
      
      // Verify the handler uses the correct session ID
      const newDataHandler = mockTerminalInstance.onData.mock.calls[0][0];
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      newDataHandler('test input');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session ID: session-2')
      );
      
      consoleSpy.mockRestore();
    });
  });
});