import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const Terminal = ({ messages, onInput, onResize, currentSessionId }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [, setIsInitialized] = useState(false);
  const processedMessagesRef = useRef(0);
  const processingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    
    console.log('Terminal useEffect triggered, current message count:', processedMessagesRef.current);
    processingRef.current = false;

    const initializeTerminal = () => {
      // Prevent multiple terminal instances
      if (!terminalRef.current || xtermRef.current || !mounted) {
        console.log('Skipping terminal init - already exists or not mounted');
        return;
      }
      
      console.log('🔴 CREATING NEW TERMINAL INSTANCE');

      // Calculate initial terminal size based on container
      const container = terminalRef.current;
      const containerRect = container.getBoundingClientRect();
      // Adjust character dimensions for better fit
      const charWidth = window.innerWidth <= 768 ? 8 : 9; // Smaller on mobile
      const charHeight = window.innerWidth <= 768 ? 15 : 17;
      const padding = window.innerWidth <= 768 ? 8 : 16; // Account for padding
      const initialCols = Math.floor((containerRect.width - padding) / charWidth) || 80;
      const initialRows = Math.floor((containerRect.height - padding) / charHeight) || 24;

      const xterm = new XTerm({
        theme: {
          background: '#0c0c0c',
          foreground: '#d4d4d4',
          cursor: '#d4d4d4',
          cursorAccent: '#0c0c0c',
          selection: '#264f78',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#e5e5e5'
        },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: window.innerWidth <= 768 ? 12 : 14,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 1000,
        tabStopWidth: 4,
        cols: initialCols,
        rows: initialRows,
        allowTransparency: false,
        convertEol: false,
        disableStdin: false,
        windowsMode: false,
        macOptionIsMeta: true,
        rightClickSelectsWord: true,
        altClickMovesCursor: true,
        screenReaderMode: false,
        allowProposedApi: true
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      try {
        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);

        xterm.open(terminalRef.current);

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        // Terminal is ready - handlers will be set up separately when session is ready
        console.log('🔴 TERMINAL INITIALIZATION - New terminal created, handlers will be set up separately');

        // Wait for terminal to be fully rendered before fitting
        const fitTimer = setTimeout(() => {
          if (mounted && fitAddon && xterm.element && terminalRef.current) {
            try {
              fitAddon.fit();
              setIsInitialized(true);
              
              // Terminal is ready for content
              console.log('🔴 TERMINAL FITTED and ready for session');
            } catch (error) {
              console.warn('Error fitting terminal on initialization:', error);
            }
          }
        }, 100);

        // Terminal is initialized and ready
        console.log('🔴 TERMINAL INITIALIZATION COMPLETE');

        // Handle window resize
        const handleResize = () => {
          if (fitAddonRef.current && xtermRef.current && xtermRef.current.element) {
            try {
              fitAddonRef.current.fit();
              
              // Send new size to server
              console.log('🔴 WINDOW RESIZE:', xtermRef.current.cols, 'x', xtermRef.current.rows, 'Session ID:', currentSessionId);
              if (onResize && currentSessionId) {
                onResize(xtermRef.current.cols, xtermRef.current.rows);
              }
            } catch (error) {
              console.warn('Error fitting terminal on resize:', error);
            }
          }
        };

        window.addEventListener('resize', handleResize);

        return () => {
          clearTimeout(fitTimer);
          window.removeEventListener('resize', handleResize);
          if (xtermRef.current) {
            xtermRef.current.dispose();
            xtermRef.current = null;
          }
          fitAddonRef.current = null;
          setIsInitialized(false);
        };
      } catch (error) {
        console.error('Error initializing terminal:', error);
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    const rafId = requestAnimationFrame(initializeTerminal);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
    };
  }, [onInput, onResize, currentSessionId]);

  useEffect(() => {
    if (messages.length > processedMessagesRef.current && xtermRef.current && !processingRef.current) {
      processingRef.current = true;
      
      const processMessages = async () => {
        const unprocessedMessages = messages.slice(processedMessagesRef.current);
        
        // Simple message processing - no complex detection needed
        
        // Process each message and ensure counter is always incremented
        for (let i = 0; i < unprocessedMessages.length; i++) {
          const message = unprocessedMessages[i];
          console.log(`Processing message ${processedMessagesRef.current + i}:`, message);
          
          try {
            switch (message.type) {
              case 'output':
                console.log('Frontend received output:', message.data.length, 'bytes');
                
                // Process the output and wait a brief moment for terminal to process
                xtermRef.current.write(message.data);
                await new Promise(resolve => setTimeout(resolve, 10));
                break;
                
              case 'buffer-restore':
                console.log('Restoring terminal buffer:', message.data.length, 'bytes for session:', message.sessionId);
                // Clear terminal first, then restore the preserved buffer content
                xtermRef.current.reset();
                xtermRef.current.clear();
                // Write the preserved buffer content
                xtermRef.current.write(message.data);
                await new Promise(resolve => setTimeout(resolve, 50));
                break;
                
              case 'terminal-refresh':
                console.log('Terminal refresh requested for session:', message.sessionId);
                // Complete terminal reset for clean reconnection
                xtermRef.current.reset();
                xtermRef.current.clear();
                // Clear scroll buffer using correct method
                try {
                  xtermRef.current.scrollToTop();
                  // Clear any internal buffers
                  xtermRef.current.selectAll();
                  xtermRef.current.clearSelection();
                } catch (error) {
                  console.warn('Error clearing terminal buffers:', error);
                }
                // Force a resize to ensure proper dimensions
                if (fitAddonRef.current) {
                  setTimeout(() => {
                    try {
                      fitAddonRef.current.fit();
                    } catch (error) {
                      console.warn('Error fitting terminal during refresh:', error);
                    }
                  }, 100);
                }
                console.log('Terminal completely reset for fresh session state');
                break;
                
                
              case 'session-started':
                console.log('Session started:', message.sessionId);
                // Don't write session started message to terminal
                // The sessionId will be handled by the parent component
                break;
                
              case 'exit':
                console.log('Process exited with code:', message.code);
                xtermRef.current.write(`\\r\\n\\r\\n[Process exited with code ${message.code}]\\r\\n`);
                break;
                
              case 'error':
                console.error('Received error:', message.message);
                xtermRef.current.write(`\\r\\n\\r\\n[Error: ${message.message}]\\r\\n`);
                break;
                
              default:
                console.log('Unknown message type:', message.type);
            }
          } catch (error) {
            console.error('Error processing message:', error, message);
          }
        }
        
        // CRITICAL: Update counter to mark all messages as processed
        processedMessagesRef.current += unprocessedMessages.length;
        console.log(`Processed ${unprocessedMessages.length} messages, total processed: ${processedMessagesRef.current}`);
        
        processingRef.current = false;
      };
      
      processMessages();
    }
  }, [messages]);

  // Set up input and resize handlers when currentSessionId changes
  useEffect(() => {
    if (xtermRef.current && currentSessionId) {
      console.log('🔴 UPDATING HANDLERS for session:', currentSessionId);
      
      // Clear existing handlers completely
      xtermRef.current.onData(() => {});
      xtermRef.current.onResize(() => {});
      
      // Add a small delay to ensure handlers are cleared
      setTimeout(() => {
        if (xtermRef.current && currentSessionId) {
          // Set up new handlers with current session ID
          xtermRef.current.onData((data) => {
            console.log('🔴 FRONTEND INPUT:', JSON.stringify(data), 'Session ID:', currentSessionId);
            if (onInput && currentSessionId) {
              onInput(data);
            } else {
              console.warn('Terminal input ignored - no active session or onInput callback');
            }
          });
          
          xtermRef.current.onResize(({ cols, rows }) => {
            console.log('🔴 FRONTEND RESIZE:', cols, 'x', rows, 'Session ID:', currentSessionId);
            if (onResize && currentSessionId) {
              onResize(cols, rows);
            } else {
              console.warn('Terminal resize ignored - no active session or onResize callback');
            }
          });
          
          console.log('🔴 HANDLERS UPDATED for session:', currentSessionId);
        }
      }, 50);
    }
  }, [currentSessionId, onInput, onResize]);

  return <div ref={terminalRef} className="terminal-wrapper" />;
};

export default Terminal;