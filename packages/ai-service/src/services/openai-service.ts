import OpenAI from 'openai';
import { AIProvider, AIRequest, AIResponse, AIStreamChunk } from '../types';
import { ServiceUnavailableError } from '@ai-dev/shared';
import { PromptUtils } from '../utils/prompt-utils';

export class OpenAIService implements AIProvider {
  public readonly name = 'openai';
  private client?: OpenAI;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    if (apiKey) {
      this.setupClient(apiKey);
    }
  }

  private setupClient(apiKey: string): void {
    this.client = new OpenAI({
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
      await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10,
      });
      return true;
    } catch (error) {
      console.error('OpenAI API availability check failed:', error);
      return false;
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.client) {
      throw new ServiceUnavailableError('OpenAI', 'API key not configured');
    }

    try {
      const messages = this.buildMessages(request);
      const model = request.options?.model || 'gpt-4-turbo-preview';
      const maxTokens = request.options?.maxTokens || 4096;
      const temperature = request.options?.temperature || 0.1;

      const startTime = Date.now();

      const response = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'text' },
      });

      const duration = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';

      // Parse the response for commands
      const { commands, output } = this.parseOpenAIResponse(content);

      return {
        id: request.id,
        success: true,
        output,
        metadata: {
          model,
          duration,
        },
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          totalCost: this.calculateCost(
            response.usage?.prompt_tokens || 0,
            response.usage?.completion_tokens || 0,
            model
          ),
        },
        executedCommands: commands,
      };
    } catch (error) {
      console.error('OpenAI execution error:', error);
      return {
        id: request.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async *streamExecute(request: AIRequest): AsyncGenerator<AIStreamChunk> {
    if (!this.client) {
      throw new ServiceUnavailableError('OpenAI', 'API key not configured');
    }

    try {
      const messages = this.buildMessages(request);
      const model = request.options?.model || 'gpt-4-turbo-preview';
      const maxTokens = request.options?.maxTokens || 4096;
      const temperature = request.options?.temperature || 0.1;

      const stream = await this.client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      });

      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
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

  private buildMessages(request: AIRequest): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const { command, context, options } = request;

    const systemPrompt = PromptUtils.buildSystemPrompt(context);

    let userContent = `User Request: ${command}`;

    if (context?.repositoryName) {
      userContent += `\nRepository: ${context.repositoryName}`;
    }

    if (context?.branch) {
      userContent += `\nBranch: ${context.branch}`;
    }

    if (context?.workingDirectory) {
      userContent += `\nWorking Directory: ${context.workingDirectory}`;
    }

    if (context?.fileContents && context.fileContents.length > 0) {
      userContent += '\n\nRelevant Files:';
      for (const file of context.fileContents) {
        userContent += `\n\n${file.path}:\n\`\`\`\n${file.content}\n\`\`\``;
      }
    }

    if (context?.projectStructure) {
      userContent += `\n\nProject Structure:\n${PromptUtils.formatProjectStructure(context.projectStructure)}`;
    }

    if (request.attachments && request.attachments.length > 0) {
      userContent += '\n\nAttachments:';
      for (const attachment of request.attachments) {
        userContent += `\n\n${attachment.filename} (${attachment.mimetype}):\n\`\`\`\n${attachment.content}\n\`\`\``;
      }
    }

    if (options?.yoloMode) {
      userContent += '\n\nYOLO MODE: Execute commands directly without additional confirmation.';
    } else {
      userContent += '\n\nPlease provide clear explanation of what you\'ll do before executing commands.';
    }

    if (options?.dryRun) {
      userContent += '\n\nDRY RUN: Only show what commands would be executed, do not actually run them.';
    }

    userContent += PromptUtils.getResponseFormatInstructions();

    return [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userContent,
      },
    ];
  }

  private parseOpenAIResponse(response: string): {
    commands: any[];
    output: string;
  } {
    const commands: any[] = [];
    let output = response;

    // Extract bash commands
    const bashMatches = response.matchAll(/```bash\n(.*?)\n```/gs);
    for (const match of bashMatches) {
      commands.push({
        command: match[1],
        type: 'bash',
      });
    }

    return { commands, output };
  }

  private calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    // OpenAI pricing (as of early 2024, adjust as needed)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 },
    };

    const modelPricing = pricing[model] || pricing['gpt-4-turbo-preview'];

    return (
      (inputTokens / 1000) * modelPricing.input +
      (outputTokens / 1000) * modelPricing.output
    );
  }
}