import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SessionList from './SessionList';

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock window.confirm
global.confirm = jest.fn();

describe('SessionList Component', () => {
  const mockOnSelectSession = jest.fn();
  const mockOnNewSession = jest.fn();

  const defaultProps = {
    onSelectSession: mockOnSelectSession,
    onNewSession: mockOnNewSession
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fetch.mockClear();
    global.confirm.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State - No Sessions', () => {
    test('should show empty state when no sessions exist', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No active sessions found.')).toBeInTheDocument();
        expect(screen.getByText('Click "Start New Session" to begin.')).toBeInTheDocument();
      });

      expect(fetch).toHaveBeenCalledWith('/api/sessions');
    });

    test('should show loading state initially', () => {
      fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<SessionList {...defaultProps} />);

      expect(screen.getByText('Loading Sessions...')).toBeInTheDocument();
    });

    test('should handle fetch error gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Error connecting to server')).toBeInTheDocument();
      });
    });
  });

  describe('Session List Display', () => {
    const mockSessions = [
      {
        sessionId: 'session-123-abc',
        workingDir: '/Users/test/project1',
        isConnected: true,
        createdAt: '2024-01-01T12:00:00Z',
        lastActive: '2024-01-01T12:30:00Z',
        hasBuffer: true,
        bufferSize: 2048
      },
      {
        sessionId: 'session-456-def',
        workingDir: '/Users/test/project2',
        isConnected: false,
        createdAt: '2024-01-01T11:00:00Z',
        lastActive: '2024-01-01T11:30:00Z',
        hasBuffer: false,
        bufferSize: 0
      }
    ];

    beforeEach(() => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSessions
      });
    });

    test('should display header correctly', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Active Claude Code Sessions')).toBeInTheDocument();
      });
    });

    test('should display all sessions with correct information', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        // Check session titles
        expect(screen.getByText('Session session-123-abc')).toBeInTheDocument();
        expect(screen.getByText('Session session-456-def')).toBeInTheDocument();
        
        // Check working directories
        expect(screen.getByText('/Users/test/project1')).toBeInTheDocument();
        expect(screen.getByText('/Users/test/project2')).toBeInTheDocument();
        
        // Check status
        expect(screen.getByText('Connected')).toBeInTheDocument();
        expect(screen.getByText('Disconnected')).toBeInTheDocument();
      });
    });

    test('should show correct status styling for connected and disconnected sessions', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const connectedStatus = screen.getByText('Connected');
        const disconnectedStatus = screen.getByText('Disconnected');

        expect(connectedStatus).toHaveClass('session-status', 'connected');
        expect(disconnectedStatus).toHaveClass('session-status', 'disconnected');
      });
    });

    test('should show buffer information for sessions with buffers', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Buffer:/)).toBeInTheDocument();
        expect(screen.getByText(/KB preserved/)).toBeInTheDocument();
      });
    });

    test('should format time correctly', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        // Should show relative time formatting (there are multiple sessions, so use getAllByText)
        const timeElements = screen.getAllByText(/ago|Just now/);
        expect(timeElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Session Actions', () => {
    const mockSession = {
      sessionId: 'session-123-abc',
      workingDir: '/Users/test/project',
      isConnected: false,
      createdAt: '2024-01-01T12:00:00Z',
      lastActive: '2024-01-01T12:00:00Z',
      hasBuffer: false,
      bufferSize: 0
    };

    beforeEach(() => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockSession]
      });
    });

    test('should show reconnect button for sessions', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Reconnect')).toBeInTheDocument();
      });
    });

    test('should show remove button for sessions', async () => {
      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });
    });

    test('should call onSelectSession when reconnect is clicked', async () => {
      // Create a fresh mock for this test
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockReconnectResponse = {
        success: true,
        sessionId: 'session-123-abc',
        workingDir: '/Users/test/project',
        message: 'Session found and ready for reconnection'
      };

      // Mock the fetch calls sequentially
      fetch.mockImplementation((url, options) => {
        if (url === '/api/sessions') {
          return Promise.resolve({
            ok: true,
            json: async () => [mockSession]
          });
        }
        if (url === '/api/sessions/session-123-abc/reconnect' && options?.method === 'POST') {
          console.log('FETCH RECONNECT API CALLED:', mockReconnectResponse);
          return Promise.resolve({
            ok: true,
            json: async () => mockReconnectResponse
          });
        }
        return Promise.reject(new Error('Unexpected fetch call'));
      });

      render(<SessionList {...defaultProps} />);

      // Wait for component to load and session to be displayed
      await waitFor(() => {
        expect(screen.getByText('Reconnect')).toBeInTheDocument();
      });

      // Click reconnect button
      const reconnectButton = screen.getByText('Reconnect');
      fireEvent.click(reconnectButton);

      // Wait for the fetch and callback to be called
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/sessions/session-123-abc/reconnect', {
          method: 'POST'
        });
      });

      await waitFor(() => {
        expect(mockOnSelectSession).toHaveBeenCalledWith(
          'session-123-abc',
          '/Users/test/project'
        );
      }, { timeout: 2000 });
      
      consoleSpy.mockRestore();
    });

    test('should show confirmation dialog when remove button is clicked', async () => {
      global.confirm.mockReturnValue(false); // User cancels

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const removeButton = screen.getByText('Remove');
        fireEvent.click(removeButton);
      });

      expect(global.confirm).toHaveBeenCalledWith(
        'Are you sure you want to remove session session-123-abc? This will terminate the Claude Code process and cannot be undone.'
      );
    });

    test('should remove session when confirmed', async () => {
      global.confirm.mockReturnValue(true); // User confirms

      // Mock successful removal
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockSession]
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const removeButton = screen.getByText('Remove');
        fireEvent.click(removeButton);
      });

      // Should call DELETE API
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith('/api/sessions/session-123-abc', {
          method: 'DELETE'
        });
      });
    });

    test('should not remove session when cancelled', async () => {
      global.confirm.mockReturnValue(false); // User cancels

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockSession]
      });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const removeButton = screen.getByText('Remove');
        fireEvent.click(removeButton);
      });

      // Should not call DELETE API
      expect(fetch).toHaveBeenCalledTimes(1); // Only initial fetch
    });
  });

  describe('Session Refresh', () => {
    test('should have refresh button', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });
    });

    test('should refetch sessions when refresh button is clicked', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const refreshButton = screen.getByText('Refresh');
        fireEvent.click(refreshButton);
      });

      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('New Session Button', () => {
    test('should show new session button', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Start New Session')).toBeInTheDocument();
      });
    });

    test('should call onNewSession when new session button is clicked', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const newSessionButton = screen.getByText('Start New Session');
        fireEvent.click(newSessionButton);
      });

      expect(mockOnNewSession).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      global.alert = jest.fn();

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{
            sessionId: 'test-session',
            workingDir: '/test',
            isConnected: false,
            createdAt: '2024-01-01T12:00:00Z',
            lastActive: '2024-01-01T12:00:00Z',
            hasBuffer: false
          }]
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Session not found' })
        });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const reconnectButton = screen.getByText('Reconnect');
        fireEvent.click(reconnectButton);
      });

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Failed to reconnect: Session not found');
      });

      global.alert.mockRestore();
    });

    test('should refresh sessions after failed operations', async () => {
      global.alert = jest.fn();

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{
            sessionId: 'test-session',
            workingDir: '/test',
            isConnected: false,
            createdAt: '2024-01-01T12:00:00Z',
            lastActive: '2024-01-01T12:00:00Z'
          }]
        })
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ message: 'Session not found' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => []
        });

      render(<SessionList {...defaultProps} />);

      await waitFor(() => {
        const reconnectButton = screen.getByText('Reconnect');
        fireEvent.click(reconnectButton);
      });

      // Should refresh sessions after error
      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(3);
      });

      global.alert.mockRestore();
    });
  });

  describe('Auto Refresh', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should refresh sessions every 5 seconds', async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => []
      });

      render(<SessionList {...defaultProps} />);

      // Initial fetch
      expect(fetch).toHaveBeenCalledTimes(1);

      // Fast forward 5 seconds
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      // Fast forward another 5 seconds
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(3);
      });
    });
  });
});