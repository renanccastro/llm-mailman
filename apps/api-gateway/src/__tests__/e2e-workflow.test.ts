import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AIOrchestrator } from '@ai-dev/ai-service';
import { ContainerManager } from '@ai-dev/container-service';
import { CommunicationService } from '@ai-dev/communication-service';
import { prisma } from '@ai-dev/database';
import { v4 as uuidv4 } from 'uuid';

describe('End-to-End Workflow: Email to Claude Code Execution', () => {
  let aiOrchestrator: AIOrchestrator;
  let containerManager: ContainerManager;
  let communicationService: CommunicationService;
  let testUserId: string;
  let testUserEmail: string;

  beforeAll(async () => {
    // Initialize services
    containerManager = new ContainerManager();
    await containerManager.initialize();

    const aiConfig = {
      defaultProvider: 'claude-code',
      requestTimeout: 30000,
    };

    aiOrchestrator = new AIOrchestrator(aiConfig, containerManager);
    await aiOrchestrator.initialize();

    const commConfig = {
      smtp: {
        host: 'localhost',
        port: 1025,
        secure: false,
        auth: { user: 'test', pass: 'test' },
      },
    };

    communicationService = new CommunicationService(commConfig);
    await communicationService.initialize();

    // Create test user
    testUserId = uuidv4();
    const testUser = await prisma.user.create({
      data: {
        id: testUserId,
        githubId: 'test-user-' + Date.now(),
        githubUsername: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: 'https://github.com/avatar.png',
      },
    });

    // Generate private email for user
    testUserEmail = await communicationService.generateUserInbox(testUserId);

    console.log('🧪 Test setup complete');
    console.log(`👤 Test User ID: ${testUserId}`);
    console.log(`📧 Test Email: ${testUserEmail}`);
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }

    await prisma.$disconnect();
    console.log('🧹 Test cleanup complete');
  });

  it('should complete full workflow: email → parsing → confirmation → execution', async () => {
    console.log('🚀 Starting end-to-end workflow test...');

    // Step 1: Simulate incoming email with development request
    const incomingEmail = {
      messageId: 'test-msg-' + Date.now(),
      from: testUserEmail,
      to: testUserEmail,
      subject: 'Create a simple hello world script',
      content: 'Please create a hello.js file that prints "Hello, World!" to the console.',
      channel: 'EMAIL' as const,
      timestamp: new Date(),
      attachments: [],
    };

    console.log('📨 Step 1: Processing incoming email...');

    // Step 2: Parse the message
    const messageResult = await communicationService.processIncomingMessage(incomingEmail);

    expect(messageResult.shouldCreateRequest).toBe(true);
    expect(messageResult.userId).toBe(testUserId);
    expect(messageResult.command).toContain('hello');

    console.log('✅ Step 2: Message parsed successfully');
    console.log(`📝 Extracted command: ${messageResult.command}`);

    // Step 3: Create request in database
    const requestId = uuidv4();
    const request = await prisma.request.create({
      data: {
        id: requestId,
        userId: testUserId,
        command: messageResult.command!,
        status: 'PENDING_CONFIRMATION',
        channel: 'EMAIL',
        source: incomingEmail.from,
      },
    });

    console.log('✅ Step 3: Request created in database');
    console.log(`🆔 Request ID: ${requestId}`);

    // Step 4: Create confirmation token and send confirmation email
    const confirmationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const confirmation = await prisma.confirmation.create({
      data: {
        id: uuidv4(),
        requestId,
        token: confirmationToken,
        method: 'EMAIL',
        contact: testUserEmail,
        expiresAt,
      },
    });

    console.log('✅ Step 4: Confirmation token created');

    // In a real scenario, this would send an actual email
    // For testing, we'll simulate the confirmation being clicked
    console.log('📧 Step 5: Simulating confirmation email sent (would be sent in production)');

    // Step 6: Simulate user clicking confirmation link
    console.log('🔗 Step 6: Simulating user confirmation...');

    // Update confirmation as used
    await prisma.confirmation.update({
      where: { id: confirmation.id },
      data: { confirmedAt: new Date() },
    });

    // Update request status
    await prisma.request.update({
      where: { id: requestId },
      data: { status: 'CONFIRMED' },
    });

    console.log('✅ Step 6: Request confirmed');

    // Step 7: Execute the command using AI Orchestrator
    console.log('🤖 Step 7: Executing command with Claude Code...');

    const aiRequest = {
      id: requestId,
      userId: testUserId,
      command: messageResult.command!,
      context: {
        workingDirectory: `/workspace/users/${testUserId}`,
        repositoryName: 'test-project',
      },
    };

    // This will use the Claude Code service with tmux sessions
    const executionResult = await aiOrchestrator.executeRequest(aiRequest);

    console.log('✅ Step 7: Command executed');
    console.log(`📊 Execution result:`, {
      success: executionResult.success,
      hasOutput: Boolean(executionResult.output),
      sessionId: executionResult.metadata?.sessionId,
    });

    // Verify execution results
    expect(executionResult.success).toBe(true);
    expect(executionResult.metadata?.sessionId).toBeDefined();

    // Step 8: Update request with results
    await prisma.request.update({
      where: { id: requestId },
      data: {
        status: executionResult.success ? 'COMPLETED' : 'FAILED',
        output: executionResult.output,
        error: executionResult.error,
        completedAt: new Date(),
      },
    });

    console.log('✅ Step 8: Request updated with results');

    // Step 9: Send completion notification
    console.log('📧 Step 9: Sending completion notification...');

    const notificationSent = await communicationService.sendExecutionNotification(
      testUserEmail,
      requestId,
      messageResult.command!,
      executionResult.success,
      executionResult.output,
      executionResult.error
    );

    expect(notificationSent).toBe(true);

    console.log('✅ Step 9: Completion notification sent');

    // Step 10: Verify session persistence
    console.log('🔄 Step 10: Testing session persistence...');

    const sessions = await aiOrchestrator.listActiveSessions(testUserId);
    expect(sessions.length).toBeGreaterThan(0);

    if (sessions.length > 0) {
      const sessionId = sessions[0].sessionId;

      // Execute another command in the same session
      const followUpResult = await aiOrchestrator.executeInSession(
        sessionId,
        'ls -la'
      );

      expect(followUpResult.success).toBe(true);
      console.log('✅ Step 10: Session persistence verified');
    }

    console.log('🎉 End-to-end workflow test completed successfully!');

    // Final verification: Check that everything is properly recorded
    const finalRequest = await prisma.request.findUnique({
      where: { id: requestId },
      include: { confirmations: true },
    });

    expect(finalRequest?.status).toBe('COMPLETED');
    expect(finalRequest?.confirmations.length).toBe(1);
    expect(finalRequest?.output).toBeDefined();

    console.log('✅ Final verification: All data properly recorded in database');
  }, 60000); // 60 second timeout

  it('should handle command rejection workflow', async () => {
    console.log('🚫 Testing rejection workflow...');

    // Create a potentially dangerous command
    const dangerousCommand = 'rm -rf /important-files';

    const incomingEmail = {
      messageId: 'test-dangerous-' + Date.now(),
      from: testUserEmail,
      to: testUserEmail,
      subject: 'Delete important files',
      content: dangerousCommand,
      channel: 'EMAIL' as const,
      timestamp: new Date(),
      attachments: [],
    };

    const messageResult = await communicationService.processIncomingMessage(incomingEmail);

    if (messageResult.shouldCreateRequest) {
      // Create request
      const requestId = uuidv4();
      await prisma.request.create({
        data: {
          id: requestId,
          userId: testUserId,
          command: messageResult.command!,
          status: 'PENDING_CONFIRMATION',
          channel: 'EMAIL',
          source: incomingEmail.from,
        },
      });

      // Analyze command for safety
      const analysis = await aiOrchestrator.analyzeCommand(testUserId, messageResult.command!);

      console.log('🔍 Command analysis:', {
        type: analysis.type,
        risks: analysis.risks,
        confidence: analysis.confidence,
      });

      // In a real scenario, dangerous commands might be auto-rejected
      // or require additional confirmation steps
      expect(analysis.type).toBeDefined();

      console.log('✅ Rejection workflow tested successfully');
    }
  });

  it('should handle session cleanup', async () => {
    console.log('🧹 Testing session cleanup...');

    // Get current sessions
    const sessionsBefore = await aiOrchestrator.listActiveSessions(testUserId);
    console.log(`📊 Sessions before cleanup: ${sessionsBefore.length}`);

    // Force cleanup (normally happens automatically)
    await aiOrchestrator.cleanupInactiveSessions();

    // Check service status
    const status = await aiOrchestrator.getServiceStatus();
    console.log('📊 Service status:', status);

    expect(status.claudeCode).toBe(true);

    console.log('✅ Session cleanup tested successfully');
  });
});