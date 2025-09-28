import { ClaudeCodeService } from '../services/claude-code-service';
import { ContainerManager } from '@ai-dev/container-service';
import { AIRequest } from '../types';

/**
 * Example demonstrating how to use the Claude Code service with tmux sessions
 *
 * This example shows the proper flow:
 * 1. Initialize the container manager and Claude Code service
 * 2. Create a persistent tmux session with Claude Code CLI running
 * 3. Send commands to the session and receive responses
 * 4. Commands are executed within the persistent Claude Code environment
 */

async function claudeCodeTmuxExample() {
  console.log('🚀 Starting Claude Code with tmux sessions example...\n');

  try {
    // Initialize services
    const containerManager = new ContainerManager();
    await containerManager.initialize();

    const claudeCodeService = new ClaudeCodeService(containerManager);

    console.log('✅ Services initialized');

    // Check if Claude Code is available
    const isAvailable = await claudeCodeService.isAvailable();
    console.log(`🔍 Claude Code available: ${isAvailable}`);

    if (!isAvailable) {
      console.log('❌ Claude Code not available, exiting...');
      return;
    }

    // Example user
    const userId = 'example-user-123';

    // Create a user container first (this would normally be done by the container service)
    console.log('📦 Creating user container...');
    await containerManager.createUserContainer(userId);

    // Example 1: Basic command execution
    console.log('\n📝 Example 1: Basic command execution');
    const basicRequest: AIRequest = {
      id: 'req-001',
      userId,
      command: 'help',
      context: {
        workingDirectory: `/workspace/users/${userId}`,
      },
    };

    const basicResponse = await claudeCodeService.execute(basicRequest);
    console.log('Response:', {
      success: basicResponse.success,
      output: basicResponse.output?.substring(0, 200) + '...',
      sessionId: basicResponse.metadata?.sessionId,
    });

    // Example 2: Code analysis command
    console.log('\n🔍 Example 2: Code analysis');
    const analysisRequest: AIRequest = {
      id: 'req-002',
      userId,
      command: 'Please analyze the current directory structure and create a simple hello.js file',
      context: {
        workingDirectory: `/workspace/users/${userId}`,
        repositoryName: 'example-project',
      },
    };

    const analysisResponse = await claudeCodeService.execute(analysisRequest);
    console.log('Analysis Response:', {
      success: analysisResponse.success,
      sessionId: analysisResponse.metadata?.sessionId,
    });

    // Example 3: Streaming execution
    console.log('\n🌊 Example 3: Streaming execution');
    const streamRequest: AIRequest = {
      id: 'req-003',
      userId,
      command: 'ls -la && pwd',
      context: {
        workingDirectory: `/workspace/users/${userId}`,
      },
    };

    console.log('Streaming response:');
    for await (const chunk of claudeCodeService.streamExecute(streamRequest)) {
      console.log(`[${chunk.type}]`, chunk.content);

      if (chunk.type === 'complete') {
        break;
      }
    }

    // Example 4: Session management
    console.log('\n⚙️ Example 4: Session management');
    const sessions = await claudeCodeService.listActiveSessions(userId);
    console.log(`Active sessions: ${sessions.length}`);

    if (sessions.length > 0) {
      const sessionId = sessions[0].sessionId;

      // Get session output for debugging
      const output = await claudeCodeService.getSessionOutput(sessionId, 10);
      console.log('Last 10 lines of session output:', output.substring(0, 200) + '...');

      // Execute command directly in session
      const directResult = await claudeCodeService.executeInSession(
        sessionId,
        'echo "Direct command execution in tmux session"'
      );
      console.log('Direct execution result:', directResult.success);
    }

    // Example 5: Error handling
    console.log('\n❗ Example 5: Error handling');
    const errorRequest: AIRequest = {
      id: 'req-004',
      userId: 'non-existent-user',
      command: 'help',
    };

    const errorResponse = await claudeCodeService.execute(errorRequest);
    console.log('Error Response:', {
      success: errorResponse.success,
      error: errorResponse.error,
    });

    console.log('\n✨ Example completed successfully!');

    // Cleanup
    console.log('\n🧹 Cleaning up sessions...');
    await claudeCodeService.cleanupInactiveSessions(0); // Clean up immediately for demo

  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

// Export for use in other examples
export { claudeCodeTmuxExample };

// Run example if this file is executed directly
if (require.main === module) {
  claudeCodeTmuxExample().catch(console.error);
}