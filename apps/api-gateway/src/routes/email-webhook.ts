import { Router } from 'express';
import { prisma } from '@ai-dev/database';
import { communicationService, aiOrchestrator } from '../services';
import { executionQueue, notificationQueue } from '../queues';
import { v4 as uuidv4 } from 'uuid';

export const emailWebhookRouter: any = Router();

interface IncomingEmailWebhook {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
  messageId: string;
  timestamp: string;
}

// Webhook endpoint for incoming emails (e.g., from SendGrid, Mailgun, etc.)
emailWebhookRouter.post('/incoming', async (req, res) => {
  try {
    console.log('📧 Incoming email webhook received');

    const emailData: IncomingEmailWebhook = req.body;

    // Parse the incoming email
    const incomingMessage = {
      id: emailData.messageId,
      messageId: emailData.messageId,
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      content: emailData.text || emailData.html || '',
      channel: 'EMAIL' as const,
      timestamp: new Date(emailData.timestamp || Date.now()),
      attachments: emailData.attachments || [],
    };

    // Process the message to extract user and command
    const messageResult = await communicationService.processIncomingMessage(incomingMessage as any);

    if (!messageResult.shouldCreateRequest) {
      console.log('❌ Message does not contain valid request:', messageResult.error);
      return res.status(200).json({ status: 'ignored', reason: messageResult.error });
    }

    const { userId, command } = messageResult;

    // Get user to check if they have repositories configured
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { repositories: true },
    });

    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(200).json({ status: 'ignored', reason: 'User not found' });
    }

    // Extract repository information from email
    const repositoryInfo = await extractRepositoryFromEmail(emailData, user.repositories);

    if (!repositoryInfo.repository) {
      // Send email asking user to specify repository
      await communicationService.sendEmail({
        to: emailData.from,
        subject: '📋 Repository Required - AI Dev Assistant',
        html: generateRepositorySelectionEmail(user, command!),
        text: `Please specify which repository you want to work with. Reply with: "Repository: <repo-name>" followed by your command.`,
      });

      return res.status(200).json({ status: 'repository_required' });
    }

    // Create request in database
    const requestId = uuidv4();
    const request = await prisma.request.create({
      data: {
        id: requestId,
        userId: userId!,
        command: command!,
        status: 'PENDING_CONFIRMATION',
        channel: 'EMAIL',
        source: emailData.from,
        repositoryId: repositoryInfo.repository.id,
      },
    } as any);

    console.log(`✅ Created request ${requestId} for repository ${repositoryInfo.repository.name}`);

    // Create confirmation token
    const confirmationToken = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.confirmation.create({
      data: {
        id: uuidv4(),
        requestId,
        token: confirmationToken,
        contact: emailData.from,
        expiresAt,
      },
    } as any);

    // Send confirmation email with repository context
    await communicationService.sendConfirmationEmail(
      emailData.from,
      requestId,
      `[${repositoryInfo.repository.name}] ${command}`,
      confirmationToken,
      expiresAt
    );

    console.log(`📧 Sent confirmation email for request ${requestId}`);

    res.status(200).json({
      status: 'confirmation_sent',
      requestId,
      repository: repositoryInfo.repository.name,
    });

  } catch (error) {
    console.error('❌ Email webhook processing failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Confirmation endpoint (when user clicks confirm link)
emailWebhookRouter.post('/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find and validate confirmation
    const confirmation = await prisma.confirmation.findUnique({
      where: { token },
      include: {
        request: {
          include: {
            user: true,
            repository: true
          }
        }
      },
    });

    if (!confirmation) {
      return res.status(404).json({ error: 'Invalid confirmation token' });
    }

    if (confirmation.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Confirmation token expired' });
    }

    if (confirmation.confirmedAt) {
      return res.status(400).json({ error: 'Request already confirmed' });
    }

    // Mark as confirmed
    await prisma.confirmation.update({
      where: { id: confirmation.id },
      data: { confirmedAt: new Date() },
    });

    await prisma.request.update({
      where: { id: confirmation.requestId },
      data: { status: 'CONFIRMED' },
    });

    const request = confirmation.request;
    const repository = request.repository!;

    console.log(`✅ Request ${request.id} confirmed for repository ${repository.name}`);

    // Queue the execution with repository context
    await executionQueue.add('execute-with-repository', {
      requestId: request.id,
      userId: request.userId,
      command: request.command,
      repositoryId: repository.id,
      repositoryName: repository.name,
      repositoryUrl: repository.cloneUrl,
      branch: repository.defaultBranch || 'main',
    });

    console.log(`🚀 Queued execution for request ${request.id}`);

    // Return success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Request Confirmed - AI Dev Assistant</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; }
          .code { background: #f8f9fa; padding: 10px; border-radius: 3px; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="success">
          <h2>✅ Request Confirmed</h2>
          <p><strong>Repository:</strong> ${repository.name}</p>
          <p><strong>Command:</strong></p>
          <div class="code">${request.command}</div>
          <p>Your request is now being processed. You'll receive an email with the results shortly.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('❌ Confirmation processing failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to extract repository from email content
async function extractRepositoryFromEmail(
  emailData: IncomingEmailWebhook,
  userRepositories: any[]
): Promise<{ repository: any | null; extractedName?: string }> {
  const content = (emailData.subject + ' ' + (emailData.text || emailData.html || '')).toLowerCase();

  // Look for explicit repository mentions
  const repoPatterns = [
    /repository:\s*([a-zA-Z0-9\-_.\/]+)/i,
    /repo:\s*([a-zA-Z0-9\-_.\/]+)/i,
    /project:\s*([a-zA-Z0-9\-_.\/]+)/i,
    /\[([a-zA-Z0-9\-_.\/]+)\]/i, // [repo-name]
  ];

  for (const pattern of repoPatterns) {
    const match = content.match(pattern);
    if (match) {
      const extractedName = match[1];

      // Find matching repository
      const repository = userRepositories.find(repo =>
        repo.name.toLowerCase().includes(extractedName.toLowerCase()) ||
        extractedName.toLowerCase().includes(repo.name.toLowerCase())
      );

      if (repository) {
        return { repository, extractedName };
      }
    }
  }

  // If no explicit mention, try to match repository names in content
  for (const repo of userRepositories) {
    if (content.includes(repo.name.toLowerCase())) {
      return { repository: repo, extractedName: repo.name };
    }
  }

  // If user has only one repository, use it
  if (userRepositories.length === 1) {
    return { repository: userRepositories[0] };
  }

  return { repository: null };
}

// Generate email asking user to specify repository
function generateRepositorySelectionEmail(user: any, command: string): string {
  const repositories = user.repositories.map((repo: any) =>
    `<li><strong>${repo.name}</strong> - ${repo.description || 'No description'}</li>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Repository Selection Required - AI Dev Assistant</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .command { background: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 6px; font-family: monospace; }
        .repos { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #4F46E5; }
        .example { background: #e0f2fe; padding: 10px; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🤖 AI Dev Assistant</h1>
          <p>Repository Selection Required</p>
        </div>
        <div class="content">
          <p>Hi ${user.name || user.githubUsername}!</p>

          <p>I received your development request:</p>
          <div class="command">${command}</div>

          <p>However, I need to know which repository you want to work with. You have access to:</p>

          <div class="repos">
            <ul>${repositories}</ul>
          </div>

          <p><strong>To proceed, please reply to this email with:</strong></p>

          <div class="example">
            Repository: [repository-name]<br>
            ${command}
          </div>

          <p>Or include the repository name in square brackets in your subject line:</p>

          <div class="example">
            Subject: [repository-name] ${command}
          </div>

          <p>I'll then create a clean container with your repository code and execute your request!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}