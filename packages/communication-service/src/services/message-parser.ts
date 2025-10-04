import { IncomingMessage, ParsedCommand } from '../types';

export class MessageParser {
  private commandPatterns = {
    // Request creation patterns
    createRequest: [
      /^(run|execute|do|perform)\s+(.+)/i,
      /^(fix|debug|solve)\s+(.+)/i,
      /^(build|compile|test)\s+(.+)/i,
      /^(deploy|release)\s+(.+)/i,
      /^(add|create|implement)\s+(.+)/i,
      /^(update|modify|change)\s+(.+)/i,
      /^(help\s+me\s+)(.+)/i,
      /^(.+)$/i, // Catch-all for any other text
    ],

    // Confirmation patterns
    confirm: [
      /^(yes|y|confirm|ok|approve|accept)\s*(.*)$/i,
      /^confirm\s+([a-z0-9-]+)$/i,
      /^✅|👍|✓/,
    ],

    // Cancellation patterns
    cancel: [
      /^(no|n|cancel|reject|deny|abort)\s*(.*)$/i,
      /^cancel\s+([a-z0-9-]+)$/i,
      /^❌|👎|✗/,
    ],

    // Status check patterns
    status: [
      /^(status|state|check)\s*(.*)$/i,
      /^(what('s| is)\s+)?(happening|running|status)/i,
      /^(show\s+)?(logs?|output)/i,
    ],

    // Help patterns
    help: [
      /^(help|\\help|\?|commands?)$/i,
      /^(how\s+)?(to|do\s+i)\s+(.+)/i,
    ],
  };

  private repositoryPatterns = [
    /(?:in|for|on)\s+([a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+)/i, // owner/repo format
    /(?:repository|repo)\s+([a-zA-Z0-9-_.]+)/i,
    /(?:project)\s+([a-zA-Z0-9-_.]+)/i,
  ];

  private branchPatterns = [
    /(?:branch|on)\s+([a-zA-Z0-9-_.\/]+)/i,
    /(?:in|from)\s+branch\s+([a-zA-Z0-9-_.\/]+)/i,
  ];

  parseMessage(message: IncomingMessage): ParsedCommand {
    const content = message.content.trim();
    const lowerContent = content.toLowerCase();

    // Check for confirmation first (highest priority)
    if (this.matchesPatterns(lowerContent, this.commandPatterns.confirm)) {
      return {
        action: 'confirm_request',
        confidence: 0.95,
        parameters: this.extractConfirmationToken(content),
      };
    }

    // Check for cancellation
    if (this.matchesPatterns(lowerContent, this.commandPatterns.cancel)) {
      return {
        action: 'cancel_request',
        confidence: 0.95,
        parameters: this.extractCancellationToken(content),
      };
    }

    // Check for status requests
    if (this.matchesPatterns(lowerContent, this.commandPatterns.status)) {
      return {
        action: 'status_check',
        confidence: 0.9,
      };
    }

    // Check for help requests
    if (this.matchesPatterns(lowerContent, this.commandPatterns.help)) {
      return {
        action: 'help',
        confidence: 0.9,
      };
    }

    // Parse as command request
    return this.parseCommandRequest(message);
  }

  private parseCommandRequest(message: IncomingMessage): ParsedCommand {
    const content = message.content.trim();

    // Extract repository information
    const repositoryName = this.extractRepository(content);

    // Extract branch information
    const branch = this.extractBranch(content);

    // Clean the command by removing repository and branch references
    const cleanCommand = this.cleanCommand(content);

    // Extract additional parameters
    const parameters = this.extractParameters(content);

    // Determine confidence based on command structure
    const confidence = this.calculateConfidence(content, repositoryName, cleanCommand);

    return {
      action: 'create_request',
      command: cleanCommand,
      repositoryName,
      branch,
      parameters,
      attachments: message.attachments,
      confidence,
    };
  }

  private matchesPatterns(text: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
  }

  private extractRepository(text: string): string | undefined {
    for (const pattern of this.repositoryPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }

  private extractBranch(text: string): string | undefined {
    for (const pattern of this.branchPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }

  private cleanCommand(text: string): string {
    let cleaned = text;

    // Remove repository references
    for (const pattern of this.repositoryPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove branch references
    for (const pattern of this.branchPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  private extractParameters(text: string): Record<string, string> {
    const parameters: Record<string, string> = {};

    // Extract common parameters
    const paramPatterns = {
      file: /(?:file|filename)\s+([^\s]+)/i,
      directory: /(?:dir|directory|folder)\s+([^\s]+)/i,
      environment: /(?:env|environment)\s+([^\s]+)/i,
      version: /(?:version|v)\s+([^\s]+)/i,
      port: /(?:port)\s+(\d+)/i,
    };

    for (const [key, pattern] of Object.entries(paramPatterns)) {
      const match = text.match(pattern);
      if (match) {
        parameters[key] = match[1];
      }
    }

    return parameters;
  }

  private extractConfirmationToken(text: string): Record<string, string> {
    const parameters: Record<string, string> = {};

    // Look for confirmation token
    const tokenMatch = text.match(/confirm\s+([a-z0-9-]+)/i);
    if (tokenMatch) {
      parameters.token = tokenMatch[1];
    }

    return parameters;
  }

  private extractCancellationToken(text: string): Record<string, string> {
    const parameters: Record<string, string> = {};

    // Look for cancellation token
    const tokenMatch = text.match(/cancel\s+([a-z0-9-]+)/i);
    if (tokenMatch) {
      parameters.token = tokenMatch[1];
    }

    return parameters;
  }

  private calculateConfidence(
    originalText: string,
    repositoryName?: string,
    _cleanCommand?: string
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for structured commands
    if (this.containsActionWords(originalText)) {
      confidence += 0.2;
    }

    // Increase confidence if repository is specified
    if (repositoryName) {
      confidence += 0.15;
    }

    // Increase confidence for common development tasks
    if (this.containsDevKeywords(originalText)) {
      confidence += 0.15;
    }

    // Decrease confidence for very short or vague commands
    if (originalText.length < 10) {
      confidence -= 0.2;
    }

    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  private containsActionWords(text: string): boolean {
    const actionWords = [
      'run', 'execute', 'build', 'test', 'deploy', 'install', 'update',
      'create', 'add', 'remove', 'delete', 'fix', 'debug', 'compile',
      'start', 'stop', 'restart', 'configure', 'setup'
    ];

    const lowerText = text.toLowerCase();
    return actionWords.some(word => lowerText.includes(word));
  }

  private containsDevKeywords(text: string): boolean {
    const devKeywords = [
      'npm', 'yarn', 'pnpm', 'git', 'docker', 'kubernetes', 'node',
      'python', 'javascript', 'typescript', 'react', 'vue', 'angular',
      'api', 'server', 'database', 'migration', 'test', 'lint',
      'prettier', 'eslint', 'webpack', 'vite', 'package.json'
    ];

    const lowerText = text.toLowerCase();
    return devKeywords.some(keyword => lowerText.includes(keyword));
  }

  generateHelpText(): string {
    return `🤖 **AI Dev Assistant Help**

**How to use:**
1. Send me development commands naturally
2. I'll ask for confirmation before executing
3. You'll receive updates on progress

**Example commands:**
• "Run tests in my-repo"
• "Deploy to staging branch feature/new-ui"
• "Fix the TypeScript errors"
• "Build the project"
• "Install dependencies"

**Confirmation:**
• Reply "yes" or "confirm" to approve
• Reply "no" or "cancel" to reject
• Confirmations expire in 5 minutes

**Status:**
• Send "status" to check ongoing tasks
• Send "logs" to see recent output

**Tips:**
• Specify repository name when working with multiple projects
• Include branch names for specific branches
• Attach files for context if needed

Need more help? Visit our documentation or contact support.`;
  }
}