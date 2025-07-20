const { getClaudeCliArgs } = require('./index.js');

describe('Claude CLI Arguments Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = {
      CLAUDE_CLI_ARGS: process.env.CLAUDE_CLI_ARGS
    };
    
    // Clear require cache to get fresh function
    delete require.cache[require.resolve('./index.js')];
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv.CLAUDE_CLI_ARGS) {
      process.env.CLAUDE_CLI_ARGS = originalEnv.CLAUDE_CLI_ARGS;
    } else {
      delete process.env.CLAUDE_CLI_ARGS;
    }
  });

  test('should return default arguments when no environment variable is set', () => {
    delete process.env.CLAUDE_CLI_ARGS;
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions']);
  });

  test('should return default arguments when environment variable is empty', () => {
    process.env.CLAUDE_CLI_ARGS = '';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions']);
  });

  test('should return default arguments when environment variable is whitespace only', () => {
    process.env.CLAUDE_CLI_ARGS = '   ';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions']);
  });

  test('should parse space-separated arguments correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '--verbose --no-color --debug';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--verbose', '--no-color', '--debug']);
  });

  test('should parse arguments with extra spaces correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '  --verbose   --no-color  --debug  ';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--verbose', '--no-color', '--debug']);
  });

  test('should parse single argument correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '--verbose';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--verbose']);
  });

  test('should parse JSON array format correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '["--verbose", "--no-color", "--debug"]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--verbose', '--no-color', '--debug']);
  });

  test('should parse JSON array with complex arguments correctly', () => {
    process.env.CLAUDE_CLI_ARGS = '["--config", "/path/to/config.json", "--verbose"]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--config', '/path/to/config.json', '--verbose']);
  });

  test('should fallback to space-separated parsing when JSON parsing fails', () => {
    process.env.CLAUDE_CLI_ARGS = '["--invalid-json --verbose --debug';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['["--invalid-json', '--verbose', '--debug']);
  });

  test('should handle empty JSON array', () => {
    process.env.CLAUDE_CLI_ARGS = '[]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual([]);
  });

  test('should handle arguments with equals signs', () => {
    process.env.CLAUDE_CLI_ARGS = '--config=/path/to/config --timeout=30';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--config=/path/to/config', '--timeout=30']);
  });

  test('should handle quoted arguments in JSON format', () => {
    process.env.CLAUDE_CLI_ARGS = '["--message", "Hello World", "--path", "/tmp/test dir"]';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--message', 'Hello World', '--path', '/tmp/test dir']);
  });

  test('should handle mixed argument formats', () => {
    process.env.CLAUDE_CLI_ARGS = '--dangerously-skip-permissions --verbose --no-interactive';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    expect(result).toEqual(['--dangerously-skip-permissions', '--verbose', '--no-interactive']);
  });

  test('should handle invalid JSON that is not an array', () => {
    process.env.CLAUDE_CLI_ARGS = '{"config": "value"}';
    
    const { getClaudeCliArgs } = require('./index.js');
    const result = getClaudeCliArgs();
    
    // Should fallback to space-separated parsing
    expect(result).toEqual(['{"config":', '"value"}']);
  });
});