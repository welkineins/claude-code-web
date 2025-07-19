import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const Terminal = ({ messages, onInput, onResize }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const processedMessagesRef = useRef(0);
  const processingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    
    // Don't reset message processing counter - it should persist across re-renders
    console.log('Terminal useEffect triggered, current message count:', processedMessagesRef.current);
    processingRef.current = false;

    const initializeTerminal = () => {
      if (!terminalRef.current || xtermRef.current || !mounted) return;

      // Calculate initial terminal size based on container
      const container = terminalRef.current;
      const containerRect = container.getBoundingClientRect();
      const charWidth = 9; // Approximate character width
      const charHeight = 17; // Approximate character height
      const initialCols = Math.floor((containerRect.width - 16) / charWidth) || 80;
      const initialRows = Math.floor((containerRect.height - 16) / charHeight) || 24;

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

        // Handle input from terminal
        xterm.onData((data) => {
          console.log('🔴 FRONTEND INPUT:', JSON.stringify(data));
          if (onInput) {
            onInput(data);
          }
        });
        
        // Terminal is ready - ensure it's clean for the session
        console.log('🔴 TERMINAL INITIALIZATION - New terminal created');

        // Handle resize
        xterm.onResize(({ cols, rows }) => {
          console.log('🔴 FRONTEND RESIZE:', cols, 'x', rows);
          if (onResize) {
            onResize(cols, rows);
          }
        });

        // Wait for terminal to be fully rendered before fitting
        const fitTimer = setTimeout(() => {
          if (mounted && fitAddon && xterm.element && terminalRef.current) {
            try {
              fitAddon.fit();
              setIsInitialized(true);
              
              // Send initial resize to server to sync dimensions
              console.log('🔴 INITIAL FIT RESIZE:', xterm.cols, 'x', xterm.rows);
              if (onResize) {
                onResize(xterm.cols, xterm.rows);
              }
            } catch (error) {
              console.warn('Error fitting terminal on initialization:', error);
            }
          }
        }, 100);

        // Send another resize after a brief delay to ensure Claude Code gets the correct size
        const syncTimer = setTimeout(() => {
          if (mounted && fitAddon && xtermRef.current && xtermRef.current.element) {
            try {
              fitAddon.fit();
              console.log('🔴 SYNC TIMER RESIZE:', xtermRef.current.cols, 'x', xtermRef.current.rows);
              if (onResize) {
                onResize(xtermRef.current.cols, xtermRef.current.rows);
              }
            } catch (error) {
              console.warn('Error in terminal size sync:', error);
            }
          }
        }, 500);

        // Handle window resize
        const handleResize = () => {
          if (fitAddonRef.current && xtermRef.current && xtermRef.current.element) {
            try {
              fitAddonRef.current.fit();
              
              // Send new size to server
              console.log('🔴 WINDOW RESIZE:', xtermRef.current.cols, 'x', xtermRef.current.rows);
              if (onResize) {
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
          clearTimeout(syncTimer);
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
  }, [onInput, onResize]);

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
                console.log('Restoring session buffer:', message.data ? message.data.length + ' bytes' : 'empty');
                // Only restore if there's actual buffer data
                if (message.data && message.data.length > 0) {
                  // Clear terminal completely and restore session buffer
                  xtermRef.current.reset();
                  xtermRef.current.clear();
                  // Write the buffer data - it already contains proper control sequences
                  xtermRef.current.write(message.data);
                  await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for processing
                } else {
                  console.log('No buffer to restore - keeping current terminal state');
                }
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

  return <div ref={terminalRef} className="terminal-wrapper" />;
};

export default Terminal;