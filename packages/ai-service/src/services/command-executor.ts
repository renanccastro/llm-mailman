import { EventEmitter } from 'events';
import { ExecOptions, ExecResult, ExecutedCommand } from '../types';

export class CommandExecutor extends EventEmitter {
  private maxConcurrentExecutions: number;
  private currentExecutions: number = 0;
  private executionQueue: Array<() => Promise<void>> = [];

  constructor(maxConcurrentExecutions: number = 5) {
    super();
    this.maxConcurrentExecutions = maxConcurrentExecutions;
  }

  async execute(options: ExecOptions): Promise<ExecutedCommand> {
    return new Promise((resolve, reject) => {
      const executeCommand = async () => {
        try {
          this.currentExecutions++;
          const result = await this.executeInternal(options);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.currentExecutions--;
          this.processQueue();
        }
      };

      if (this.currentExecutions < this.maxConcurrentExecutions) {
        executeCommand();
      } else {
        this.executionQueue.push(executeCommand);
      }
    });
  }

  private async executeInternal(options: ExecOptions): Promise<ExecutedCommand> {
    const startTime = Date.now();

    // This would integrate with the container service
    // For now, we'll simulate command execution
    const command = options.command.join(' ');

    // Emit execution started event
    this.emit('execution:started', {
      containerId: options.containerId,
      command,
      workDir: options.workDir,
    });

    try {
      // In a real implementation, this would execute the command in the container
      // using the container service (Docker or Kubernetes)
      const result = await this.simulateExecution(options);

      const duration = Date.now() - startTime;

      const executedCommand: ExecutedCommand = {
        command,
        workingDirectory: options.workDir || '/workspace',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration,
        timestamp: new Date(),
      };

      this.emit('execution:completed', executedCommand);

      return executedCommand;
    } catch (error) {
      const duration = Date.now() - startTime;

      const executedCommand: ExecutedCommand = {
        command,
        workingDirectory: options.workDir || '/workspace',
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        duration,
        timestamp: new Date(),
      };

      this.emit('execution:failed', executedCommand);

      return executedCommand;
    }
  }

  private async simulateExecution(options: ExecOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const command = options.command.join(' ');

    // Simulate some common commands for demonstration
    switch (options.command[0]) {
      case 'echo':
        return {
          exitCode: 0,
          stdout: options.command.slice(1).join(' ') + '\n',
          stderr: '',
        };

      case 'pwd':
        return {
          exitCode: 0,
          stdout: options.workDir || '/workspace\n',
          stderr: '',
        };

      case 'ls':
        return {
          exitCode: 0,
          stdout: 'README.md\npackage.json\nsrc/\ndist/\nnode_modules/\n',
          stderr: '',
        };

      case 'whoami':
        return {
          exitCode: 0,
          stdout: 'aidev\n',
          stderr: '',
        };

      case 'node':
        if (options.command.includes('--version')) {
          return {
            exitCode: 0,
            stdout: 'v20.11.0\n',
            stderr: '',
          };
        }
        break;

      case 'npm':
        if (options.command.includes('install')) {
          return {
            exitCode: 0,
            stdout: 'added 120 packages in 15s\n',
            stderr: '',
          };
        }
        if (options.command.includes('test')) {
          return {
            exitCode: 0,
            stdout: 'All tests passed!\n✓ 25 tests completed\n',
            stderr: '',
          };
        }
        break;

      case 'git':
        if (options.command.includes('status')) {
          return {
            exitCode: 0,
            stdout: 'On branch main\nnothing to commit, working tree clean\n',
            stderr: '',
          };
        }
        break;

      default:
        // For unknown commands, simulate a generic response
        return {
          exitCode: 0,
          stdout: `Command '${command}' executed successfully\n`,
          stderr: '',
        };
    }

    // Default case
    return {
      exitCode: 0,
      stdout: `Command '${command}' executed\n`,
      stderr: '',
    };
  }

  private processQueue(): void {
    if (this.executionQueue.length > 0 && this.currentExecutions < this.maxConcurrentExecutions) {
      const nextExecution = this.executionQueue.shift();
      if (nextExecution) {
        nextExecution();
      }
    }
  }

  getQueueStatus(): {
    currentExecutions: number;
    queuedExecutions: number;
    maxConcurrent: number;
  } {
    return {
      currentExecutions: this.currentExecutions,
      queuedExecutions: this.executionQueue.length,
      maxConcurrent: this.maxConcurrentExecutions,
    };
  }

  async killExecution(containerId: string): Promise<boolean> {
    // In a real implementation, this would kill the running process in the container
    this.emit('execution:killed', { containerId });
    return true;
  }

  validateCommand(command: string[]): { valid: boolean; reason?: string } {
    const cmd = command[0];

    // Block potentially dangerous commands
    const dangerousCommands = [
      'rm', 'rmdir', 'del', 'format', 'fdisk', 'mkfs',
      'shutdown', 'reboot', 'halt', 'poweroff',
      'dd', 'shred', 'wipe',
    ];

    if (dangerousCommands.includes(cmd)) {
      // Allow some safe variations
      if (cmd === 'rm' && !command.includes('-rf') && !command.some(arg => arg.startsWith('/'))) {
        return { valid: true };
      }

      return {
        valid: false,
        reason: `Command '${cmd}' is potentially dangerous and has been blocked`,
      };
    }

    // Block commands with dangerous flags
    const dangerousFlags = ['-rf', '--force', '--recursive'];
    for (const flag of dangerousFlags) {
      if (command.includes(flag) && cmd === 'rm') {
        // Check if it's targeting system directories
        const systemPaths = ['/', '/bin', '/sbin', '/usr', '/etc', '/var', '/sys', '/proc'];
        for (const arg of command) {
          if (systemPaths.some(path => arg.startsWith(path))) {
            return {
              valid: false,
              reason: `Cannot use '${flag}' on system directory '${arg}'`,
            };
          }
        }
      }
    }

    return { valid: true };
  }

  sanitizeCommand(command: string[]): string[] {
    return command.map(arg => {
      // Remove potentially dangerous characters
      return arg.replace(/[;&|`$(){}[\]]/g, '');
    });
  }
}