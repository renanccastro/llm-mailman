import { AIContext, ProjectStructure, FileNode } from '../types';

export class PromptUtils {
  static buildSystemPrompt(context?: AIContext): string {
    let prompt = `You are Claude Code, an AI development assistant with access to a persistent development environment. You help developers with coding tasks, debugging, testing, deployment, and general development workflow.

## Your Capabilities:
- Execute terminal commands in a containerized Linux environment
- Read and write files in the workspace
- Install packages and dependencies
- Run tests, builds, and deployments
- Debug code and fix issues
- Analyze project structure and dependencies
- Work with Git repositories
- Use development tools (npm, yarn, pnpm, docker, etc.)

## Your Environment:
- Ubuntu 22.04 container with development tools
- Node.js, Python, Go, Rust pre-installed
- Docker available for containerized workflows
- Persistent workspace at /workspace
- Internet access for downloading packages

## Your Response Format:
1. First, explain what you understand from the request
2. Outline your approach and what commands you'll run
3. Execute commands using \`\`\`bash code blocks
4. Provide clear explanations of outputs and next steps
5. Suggest improvements or alternative approaches when relevant

## Security Guidelines:
- Always explain potentially destructive operations before executing
- Never execute commands that could compromise the host system
- Respect file permissions and ownership
- Avoid exposing sensitive information in outputs
- Ask for confirmation before making significant changes

## Best Practices:
- Use appropriate error handling in scripts
- Follow project conventions and existing patterns
- Suggest testing strategies for changes
- Document important decisions and changes
- Keep responses concise but informative`;

    if (context) {
      if (context.repositoryName) {
        prompt += `\n\n## Current Repository: ${context.repositoryName}`;
      }

      if (context.branch) {
        prompt += `\n## Current Branch: ${context.branch}`;
      }

      if (context.workingDirectory) {
        prompt += `\n## Working Directory: ${context.workingDirectory}`;
      }

      if (context.environment) {
        prompt += `\n## Environment Variables:\n${Object.entries(context.environment)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n')}`;
      }

      if (context.previousCommands && context.previousCommands.length > 0) {
        prompt += `\n## Recent Commands:\n${context.previousCommands
          .slice(-5)
          .map(cmd => `- ${cmd}`)
          .join('\n')}`;
      }
    }

    return prompt;
  }

  static formatProjectStructure(structure: ProjectStructure): string {
    let formatted = `Project Root: ${structure.root}\n`;

    if (structure.packageManager) {
      formatted += `Package Manager: ${structure.packageManager}\n`;
    }

    if (structure.language) {
      formatted += `Primary Language: ${structure.language}\n`;
    }

    if (structure.framework) {
      formatted += `Framework: ${structure.framework}\n`;
    }

    formatted += `Has Tests: ${structure.hasTests ? 'Yes' : 'No'}\n`;
    formatted += `Has CI: ${structure.hasCi ? 'Yes' : 'No'}\n\n`;

    formatted += 'File Structure:\n';
    formatted += this.formatFileTree(structure.files, 0);

    return formatted;
  }

  private static formatFileTree(files: FileNode[], depth: number): string {
    let result = '';
    const indent = '  '.repeat(depth);

    for (const file of files) {
      const icon = file.type === 'directory' ? '📁' : '📄';
      result += `${indent}${icon} ${file.name}\n`;

      if (file.children && file.children.length > 0) {
        result += this.formatFileTree(file.children, depth + 1);
      }
    }

    return result;
  }

  static getResponseFormatInstructions(): string {
    return `

## Response Format Instructions:
- Use \`\`\`bash blocks for terminal commands
- Use \`\`\`json blocks for structured data when needed
- Explain your reasoning before executing commands
- Include expected outputs or potential error scenarios
- If multiple approaches exist, explain the trade-offs

## Command Execution Rules:
- Test commands are safe to run automatically
- Build commands are generally safe but may take time
- File modifications require clear explanation
- System changes (installing global packages) need justification
- Always verify success after important operations

Please proceed with the requested task.`;
  }

  static buildFileContextPrompt(files: Array<{ path: string; content: string }>): string {
    if (files.length === 0) {
      return '';
    }

    let prompt = '\n## File Contents:\n';

    for (const file of files) {
      prompt += `\n### ${file.path}\n`;
      prompt += '```\n' + file.content + '\n```\n';
    }

    return prompt;
  }

  static buildErrorAnalysisPrompt(error: string, command: string, context?: string): string {
    return `Please analyze this error and provide a solution:

## Command that failed:
\`\`\`bash
${command}
\`\`\`

## Error output:
\`\`\`
${error}
\`\`\`

${context ? `## Additional context:\n${context}\n` : ''}

Please:
1. Explain what caused this error
2. Provide the correct command or fix
3. Suggest how to prevent this error in the future
4. If relevant, explain any underlying concepts`;
  }

  static buildTestAnalysisPrompt(testOutput: string, testCommand: string): string {
    return `Please analyze these test results:

## Test command:
\`\`\`bash
${testCommand}
\`\`\`

## Test output:
\`\`\`
${testOutput}
\`\`\`

Please:
1. Summarize the test results
2. Identify any failing tests and their causes
3. Suggest fixes for failing tests
4. Recommend improvements to the test suite if applicable`;
  }

  static buildCodeReviewPrompt(
    filePath: string,
    content: string,
    focusAreas?: string[]
  ): string {
    let prompt = `Please review this code:

## File: ${filePath}
\`\`\`
${content}
\`\`\`

`;

    if (focusAreas && focusAreas.length > 0) {
      prompt += `## Focus areas:\n${focusAreas.map(area => `- ${area}`).join('\n')}\n\n`;
    }

    prompt += `Please provide:
1. Overall code quality assessment
2. Potential bugs or issues
3. Performance considerations
4. Security concerns if any
5. Suggestions for improvement
6. Code style and best practices feedback`;

    return prompt;
  }

  static buildDeploymentPrompt(
    environment: string,
    branch: string,
    changes: string[]
  ): string {
    return `Prepare for deployment:

## Target Environment: ${environment}
## Branch: ${branch}
## Changes to deploy:
${changes.map(change => `- ${change}`).join('\n')}

Please:
1. Verify the code is ready for deployment
2. Run appropriate tests
3. Build the application if needed
4. Suggest deployment strategy
5. Identify any potential deployment risks
6. Provide rollback plan if something goes wrong`;
  }

  static sanitizeCommand(command: string): string {
    // Remove potentially dangerous characters and patterns
    const dangerous = [
      /rm\s+-rf\s+\/[^\/\s]/,  // rm -rf / commands
      /:\(\)\{\s*:\|:\&\s*\}\;/,  // Fork bombs
      />\s*\/dev\/sd[a-z]/,  // Writing to disk devices
      /curl.*\|\s*sh/,  // Pipe curl to shell
      /wget.*\|\s*sh/,  // Pipe wget to shell
      /eval\s*\(/,  // eval commands
      /exec\s*\(/,  // exec commands
    ];

    for (const pattern of dangerous) {
      if (pattern.test(command)) {
        throw new Error(`Potentially dangerous command detected: ${command}`);
      }
    }

    return command.trim();
  }

  static extractCodeBlocks(text: string, language?: string): Array<{ language: string; code: string }> {
    const blocks: Array<{ language: string; code: string }> = [];
    const pattern = language
      ? new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\``, 'g')
      : /```(\w+)?\n([\s\S]*?)\n```/g;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      blocks.push({
        language: language || match[1] || 'text',
        code: language ? match[1] : match[2],
      });
    }

    return blocks;
  }

  static buildContextSummary(context: AIContext): string {
    const parts = [];

    if (context.repositoryName) {
      parts.push(`Repository: ${context.repositoryName}`);
    }

    if (context.branch) {
      parts.push(`Branch: ${context.branch}`);
    }

    if (context.workingDirectory) {
      parts.push(`Directory: ${context.workingDirectory}`);
    }

    if (context.projectStructure?.language) {
      parts.push(`Language: ${context.projectStructure.language}`);
    }

    if (context.projectStructure?.framework) {
      parts.push(`Framework: ${context.projectStructure.framework}`);
    }

    return parts.join(' | ');
  }

  static estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  static truncateContent(content: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (content.length <= maxChars) {
      return content;
    }

    return content.substring(0, maxChars - 100) + '\n\n... [Content truncated] ...';
  }
}