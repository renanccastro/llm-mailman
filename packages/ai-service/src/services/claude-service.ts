import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIRequest, AIResponse, AIStreamChunk, CommandAnalysis } from '../types';
import { ServiceUnavailableError } from '@ai-dev/shared';
import { PromptUtils } from '../utils/prompt-utils';

export class ClaudeService implements AIProvider {
  public readonly name = 'claude';
  private client?: Anthropic;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    if (apiKey) {
      this.setupClient(apiKey);
    }
  }

  private setupClient(apiKey: string): void {
    this.client = new Anthropic({
      apiKey,
    });
  }

  async setApiKey(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    this.setupClient(apiKey);
  }

  async isAvailable(): Promise<boolean> {
    if (!this.client || !this.apiKey) {
      return false;
    }

    try {
      // Test the API with a simple request
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Test' }],
      });
      return true;
    } catch (error) {
      console.error('Claude API availability check failed:', error);
      return false;
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.client) {
      throw new ServiceUnavailableError('Claude', 'API key not configured');
    }

    try {
      const prompt = this.buildPrompt(request);
      const model = request.options?.model || 'claude-3-5-sonnet-20241022';
      const maxTokens = request.options?.maxTokens || 4096;
      const temperature = request.options?.temperature || 0.1;

      const startTime = Date.now();

      const response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const duration = Date.now() - startTime;
      const content = response.content[0];

      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Parse the response for commands and analysis
      const { commands, analysis, output } = this.parseClaudeResponse(content.text);

      return {
        id: request.id,
        success: true,
        output,
        metadata: {
          model,
          duration,
          analysis,
        },
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalCost: this.calculateCost(response.usage.input_tokens, response.usage.output_tokens, model),
        },
        executedCommands: commands,
      };
    } catch (error) {
      console.error('Claude execution error:', error);
      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async *streamExecute(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    if (!this.client) {
      throw new ServiceUnavailableError('Claude', 'API key not configured');
    }

    try {
      const prompt = this.buildPrompt(request);
      const model = request.options?.model || 'claude-3-5-sonnet-20241022';
      const maxTokens = request.options?.maxTokens || 4096;
      const temperature = request.options?.temperature || 0.1;

      const stream = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const content = chunk.delta.text;
          fullContent += content;

          // Parse for commands in real-time
          const commandMatch = content.match(/```bash\n(.*?)\n```/s);
          if (commandMatch) {
            yield {
              type: 'command',
              content: commandMatch[1],
            };
          } else {
            yield {
              type: 'output',
              content,
            };
          }
        }
      }

      yield {
        type: 'complete',
        content: '',
        metadata: {
          fullResponse: fullContent,
        },
      };
    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async analyzeCommand(command: string, context?: any): Promise<CommandAnalysis> {
    if (!this.client) {
      throw new ServiceUnavailableError('Claude', 'API key not configured');
    }

    const analysisPrompt = `Analyze this command for potential risks and safety:

Command: ${command}

Context: ${context ? JSON.stringify(context, null, 2) : 'None'}

Please analyze:
1. Safety level (safe, potentially_dangerous, dangerous)
2. What commands will be executed
3. Potential risks
4. Files that might be affected
5. Network access requirements
6. System-level access requirements
7. Data access requirements

Respond in JSON format:
{
  "type": "safe|potentially_dangerous|dangerous",
  "commands": ["command1", "command2"],
  "risks": ["risk1", "risk2"],
  "filesAffected": ["file1", "file2"],
  "networkAccess": true|false,
  "systemAccess": true|false,
  "dataAccess": true|false,
  "confidence": 0.95
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: analysisPrompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback analysis if JSON parsing fails
      return {
        type: 'potentially_dangerous',
        commands: [command],
        risks: ['Unable to analyze command properly'],
        filesAffected: [],
        networkAccess: true,
        systemAccess: true,
        dataAccess: true,
        confidence: 0.3,
      };
    } catch (error) {
      console.error('Command analysis failed:', error);
      return {
        type: 'dangerous',
        commands: [command],
        risks: ['Analysis failed - treating as dangerous'],
        filesAffected: [],
        networkAccess: true,
        systemAccess: true,
        dataAccess: true,
        confidence: 0.1,
      };
    }
  }

  private buildPrompt(request: AIRequest): string {
    const { command, context, options } = request;

    let prompt = PromptUtils.buildSystemPrompt(context);

    prompt += `\n\nUser Request: ${command}`;

    if (context?.repositoryName) {
      prompt += `\nRepository: ${context.repositoryName}`;
    }

    if (context?.branch) {
      prompt += `\nBranch: ${context.branch}`;
    }

    if (context?.workingDirectory) {
      prompt += `\nWorking Directory: ${context.workingDirectory}`;
    }

    if (context?.fileContents && context.fileContents.length > 0) {
      prompt += '\n\nRelevant Files:';
      for (const file of context.fileContents) {
        prompt += `\n\n${file.path}:\n\`\`\`\n${file.content}\n\`\`\``;
      }
    }

    if (context?.projectStructure) {
      prompt += `\n\nProject Structure:\n${PromptUtils.formatProjectStructure(context.projectStructure)}`;
    }

    if (request.attachments && request.attachments.length > 0) {
      prompt += '\n\nAttachments:';
      for (const attachment of request.attachments) {
        prompt += `\n\n${attachment.filename} (${attachment.mimetype}):\n\`\`\`\n${attachment.content}\n\`\`\``;
      }
    }

    if (options?.yoloMode) {
      prompt += '\n\nYOLO MODE: Execute commands directly without additional confirmation.';
    } else {
      prompt += '\n\nPlease provide clear explanation of what you\'ll do before executing commands.';
    }

    if (options?.dryRun) {
      prompt += '\n\nDRY RUN: Only show what commands would be executed, do not actually run them.';
    }

    prompt += PromptUtils.getResponseFormatInstructions();

    return prompt;
  }

  private parseClaudeResponse(response: string): {
    commands: any[];
    analysis: any;
    output: string;
  } {
    const commands: any[] = [];
    let analysis = null;
    let output = response;

    // Extract bash commands
    const bashMatches = response.matchAll(/```bash\n(.*?)\n```/gs);
    for (const match of bashMatches) {
      commands.push({
        command: match[1],
        type: 'bash',
      });
    }

    // Extract analysis if present
    const analysisMatch = response.match(/```json\n(.*?)\n```/s);
    if (analysisMatch) {
      try {
        analysis = JSON.parse(analysisMatch[1]);
      } catch (error) {
        console.error('Failed to parse analysis JSON:', error);
      }
    }

    return { commands, analysis, output };
  }

  private calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    // Claude pricing (as of early 2024, adjust as needed)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
    };

    const modelPricing = pricing[model] || pricing['claude-3-5-sonnet-20241022'];

    return (
      (inputTokens / 1000) * modelPricing.input +
      (outputTokens / 1000) * modelPricing.output
    );
  }
}