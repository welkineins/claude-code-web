const request = require('supertest');
const WebSocket = require('ws');
const { spawn } = require('node-pty');

// Mock node-pty
jest.mock('node-pty', () => ({
  spawn: jest.fn()
}));

// Mock child_process exec for claude command check
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, callback) => {
    if (cmd === 'which claude') {
      callback(null, '/usr/local/bin/claude', '');
    }
  })
}));

describe('Server WebSocket and Session Management', () => {
  let app, server, wss;
  let mockPtyProcess;
  let originalEnv;

  beforeAll(() => {
    // Store original env
    originalEnv = process.env.PORT;
    
    // Set test port to avoid conflicts
    process.env.PORT = '0'; // Use port 0 to get random available port
    
    // Import the server module
    jest.isolateModules(() => {
      delete require.cache[require.resolve('./index.js')];
      const serverModule = require('./index.js');
      app = serverModule.app;
      server = serverModule.server;
      wss = serverModule.wss;
    });
  });

  beforeEach(() => {
    // Create mock PTY process
    mockPtyProcess = {
      write: jest.fn(),
      resize: jest.fn(),
      kill: jest.fn(),
      killed: false,
      on: jest.fn(),
      removeAllListeners: jest.fn(),
      pid: 12345
    };

    spawn.mockReturnValue(mockPtyProcess);
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
    // Restore original env
    if (originalEnv) {
      process.env.PORT = originalEnv;
    } else {
      delete process.env.PORT;
    }
  });

  describe('HTTP API Endpoints', () => {
    test('GET /api/sessions should return empty array when no sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('POST /api/sessions/:sessionId/reconnect should return 404 for non-existent session', async () => {
      const response = await request(app)
        .post('/api/sessions/non-existent/reconnect')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found or terminated');
    });

    test('DELETE /api/sessions/:sessionId should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/api/sessions/non-existent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Session not found');
    });
  });

  describe('WebSocket Connection and Session Management', () => {
    let ws;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.on('open', () => done());
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('should establish WebSocket connection', (done) => {
      const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
      newWs.on('open', () => {
        expect(newWs.readyState).toBe(WebSocket.OPEN);
        newWs.close();
        done();
      });
    });

    test('should handle ping/pong messages', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.type === 'pong') {
          expect(message.type).toBe('pong');
          done();
        }
      });

      ws.send(JSON.stringify({ type: 'ping' }));
    });

    test('should start a new Claude Code session', (done) => {
      let sessionId;

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'session-started') {
          sessionId = message.sessionId;
          expect(sessionId).toBeDefined();
          expect(spawn).toHaveBeenCalledWith('claude', [], expect.objectContaining({
            cwd: '/test/path',
            env: expect.objectContaining({
              TERM: 'xterm-256color',
              COLORTERM: 'truecolor',
              FORCE_COLOR: '1'
            })
          }));
          done();
        }
      });

      ws.send(JSON.stringify({
        type: 'start-session',
        path: '/test/path'
      }));
    });

    test('should handle session input correctly', (done) => {
      let sessionId;

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'session-started') {
          sessionId = message.sessionId;
          
          // Send input to the session
          ws.send(JSON.stringify({
            type: 'input',
            input: 'test command',
            sessionId: sessionId
          }));
          
          // Verify PTY received the input
          setTimeout(() => {
            expect(mockPtyProcess.write).toHaveBeenCalledWith('test command');
            done();
          }, 100);
        }
      });

      ws.send(JSON.stringify({
        type: 'start-session',
        path: '/test/path'
      }));
    });

    test('should handle session resize correctly', (done) => {
      let sessionId;

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'session-started') {
          sessionId = message.sessionId;
          
          // Send resize to the session
          ws.send(JSON.stringify({
            type: 'resize',
            cols: 120,
            rows: 40,
            sessionId: sessionId
          }));
          
          // Verify PTY was resized
          setTimeout(() => {
            expect(mockPtyProcess.resize).toHaveBeenCalledWith(120, 40);
            done();
          }, 100);
        }
      });

      ws.send(JSON.stringify({
        type: 'start-session',
        path: '/test/path'
      }));
    });
  });

  describe('Session Reconnection and Buffer Restoration', () => {
    let ws, sessionId;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.on('open', () => {
        // Start a session first
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'session-started') {
            sessionId = message.sessionId;
            done();
          }
        });

        ws.send(JSON.stringify({
          type: 'start-session',
          path: '/test/path'
        }));
      });
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('should handle session reconnection with buffer restoration', (done) => {
      // Simulate some terminal output to create buffer content
      const outputHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'data')[1];
      outputHandler('terminal output data');

      // Create new WebSocket to simulate reconnection
      const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
      
      newWs.on('open', () => {
        let messageCount = 0;
        
        newWs.on('message', (data) => {
          const message = JSON.parse(data);
          messageCount++;
          
          if (message.type === 'session-reconnected') {
            expect(message.sessionId).toBe(sessionId);
            expect(message.workingDir).toBe('/test/path');
          }
          
          if (message.type === 'buffer-restore') {
            expect(message.sessionId).toBe(sessionId);
            expect(message.data).toBe('terminal output data');
            newWs.close();
            done();
          }
        });

        // Request reconnection
        newWs.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: sessionId
        }));
      });
    });

    test('should handle reconnection to non-existent session', (done) => {
      const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
      
      newWs.on('open', () => {
        newWs.on('message', (data) => {
          const message = JSON.parse(data);
          
          if (message.type === 'error') {
            expect(message.message).toBe('Session not found or terminated');
            newWs.close();
            done();
          }
        });

        // Request reconnection to non-existent session
        newWs.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: 'non-existent-session'
        }));
      });
    });

    test('should preserve terminal buffer across reconnections', (done) => {
      // Add multiple outputs to build up buffer
      const outputHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'data')[1];
      outputHandler('output 1\n');
      outputHandler('output 2\n');
      outputHandler('output 3\n');

      // Reconnect and verify buffer contains all outputs
      const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
      
      newWs.on('open', () => {
        newWs.on('message', (data) => {
          const message = JSON.parse(data);
          
          if (message.type === 'buffer-restore') {
            expect(message.data).toContain('output 1');
            expect(message.data).toContain('output 2');
            expect(message.data).toContain('output 3');
            newWs.close();
            done();
          }
        });

        newWs.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: sessionId
        }));
      });
    });
  });

  describe('Session Cleanup and Error Handling', () => {
    let ws, sessionId;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.on('open', () => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'session-started') {
            sessionId = message.sessionId;
            done();
          }
        });

        ws.send(JSON.stringify({
          type: 'start-session',
          path: '/test/path'
        }));
      });
    });

    test('should clean up session when PTY process exits', (done) => {
      const exitHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'exit')[1];
      
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'exit') {
          expect(message.code).toBe(0);
          
          // Verify session is cleaned up
          setTimeout(async () => {
            const response = await request(app).get('/api/sessions');
            expect(response.body).toEqual([]);
            done();
          }, 100);
        }
      });

      // Simulate PTY exit
      exitHandler(0);
    });

    test('should handle PTY process errors', (done) => {
      const errorHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'error')[1];
      
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'error') {
          expect(message.message).toBe('Test PTY error');
          done();
        }
      });

      // Simulate PTY error
      errorHandler(new Error('Test PTY error'));
    });

    test('should handle invalid message types', (done) => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      ws.send(JSON.stringify({
        type: 'invalid-message-type',
        data: 'test'
      }));

      setTimeout(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Unknown message type:', 'invalid-message-type');
        consoleSpy.mockRestore();
        done();
      }, 100);
    });
  });

  describe('Critical Regression Tests for Buffer Management', () => {
    let ws, sessionId;

    beforeEach((done) => {
      ws = new WebSocket(`ws://localhost:${server.address().port}`);
      ws.on('open', () => {
        ws.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'session-started') {
            sessionId = message.sessionId;
            done();
          }
        });

        ws.send(JSON.stringify({
          type: 'start-session',
          path: '/test/path'
        }));
      });
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    test('should limit buffer size to prevent memory issues', (done) => {
      const outputHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'data')[1];
      
      // Generate large output (over 50KB limit)
      const largeOutput = 'x'.repeat(60000);
      outputHandler(largeOutput);

      // Reconnect and verify buffer is limited
      const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
      
      newWs.on('open', () => {
        newWs.on('message', (data) => {
          const message = JSON.parse(data);
          
          if (message.type === 'buffer-restore') {
            expect(message.data.length).toBeLessThanOrEqual(50000);
            newWs.close();
            done();
          }
        });

        newWs.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: sessionId
        }));
      });
    });

    test('should send buffer-restore with correct timing', (done) => {
      const outputHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'data')[1];
      outputHandler('buffer content');

      const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
      const startTime = Date.now();
      
      newWs.on('open', () => {
        newWs.on('message', (data) => {
          const message = JSON.parse(data);
          
          if (message.type === 'buffer-restore') {
            const elapsed = Date.now() - startTime;
            // Should wait at least 500ms as per the server implementation
            expect(elapsed).toBeGreaterThanOrEqual(450); // Allow some timing variance
            newWs.close();
            done();
          }
        });

        newWs.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: sessionId
        }));
      });
    });

    test('should maintain session state during multiple reconnections', (done) => {
      const outputHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'data')[1];
      outputHandler('persistent data');

      let reconnectionCount = 0;
      const maxReconnections = 3;

      function performReconnection() {
        const newWs = new WebSocket(`ws://localhost:${server.address().port}`);
        
        newWs.on('open', () => {
          newWs.on('message', (data) => {
            const message = JSON.parse(data);
            
            if (message.type === 'buffer-restore') {
              expect(message.data).toContain('persistent data');
              newWs.close();
              
              reconnectionCount++;
              if (reconnectionCount < maxReconnections) {
                setTimeout(performReconnection, 100);
              } else {
                done();
              }
            }
          });

          newWs.send(JSON.stringify({
            type: 'reconnect-session',
            sessionId: sessionId
          }));
        });
      }

      performReconnection();
    });

    test('should handle concurrent access to same session', (done) => {
      const outputHandler = mockPtyProcess.on.mock.calls.find(call => call[0] === 'data')[1];
      outputHandler('concurrent test data');

      // Create two concurrent connections to same session
      const ws1 = new WebSocket(`ws://localhost:${server.address().port}`);
      const ws2 = new WebSocket(`ws://localhost:${server.address().port}`);
      
      let ws1Connected = false;
      let ws2Connected = false;
      let bufferCount = 0;

      function checkCompletion() {
        if (bufferCount === 2) {
          ws1.close();
          ws2.close();
          done();
        }
      }

      ws1.on('open', () => {
        ws1.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'buffer-restore') {
            bufferCount++;
            checkCompletion();
          }
        });

        ws1.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: sessionId
        }));
      });

      ws2.on('open', () => {
        ws2.on('message', (data) => {
          const message = JSON.parse(data);
          if (message.type === 'buffer-restore') {
            bufferCount++;
            checkCompletion();
          }
        });

        ws2.send(JSON.stringify({
          type: 'reconnect-session',
          sessionId: sessionId
        }));
      });
    });
  });
});