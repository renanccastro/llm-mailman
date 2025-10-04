import { PrismaClient, UserRole, NotificationChannel, ContainerStatus } from '@prisma/client';
import { connectDatabase, disconnectDatabase } from './client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');
  
  try {
    await connectDatabase();

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🧹 Clearing existing data...');
    await prisma.pushSubscription.deleteMany();
    await prisma.notificationSettings.deleteMany();
    await prisma.containerSession.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.confirmation.deleteMany();
    await prisma.request.deleteMany();
    await prisma.repository.deleteMany();
    await prisma.container.deleteMany();
    await prisma.apiToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();

    // Create sample users
    console.log('👤 Creating sample users...');
    
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@aidev.platform',
        githubId: '12345678',
        githubUsername: 'admin-user',
        name: 'Admin User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345678?v=4',
        role: UserRole.ADMIN,
        privateEmail: 'admin123@aidev.platform',
        whatsappNumber: '+1234567890',
        ipWhitelist: ['127.0.0.1', '::1'],
        yoloMode: false,
        notificationChannel: NotificationChannel.BOTH,
        timezone: 'UTC',
        lastActiveAt: new Date(),
      },
    });

    const regularUser = await prisma.user.create({
      data: {
        email: 'user@example.com',
        githubId: '87654321',
        githubUsername: 'regular-user',
        name: 'Regular User',
        avatarUrl: 'https://avatars.githubusercontent.com/u/87654321?v=4',
        role: UserRole.USER,
        privateEmail: 'user123@aidev.platform',
        whatsappNumber: '+1234567891',
        ipWhitelist: ['127.0.0.1'],
        yoloMode: true,
        notificationChannel: NotificationChannel.EMAIL,
        timezone: 'America/New_York',
        lastActiveAt: new Date(),
      },
    });

    // Create API tokens
    console.log('🔑 Creating API tokens...');
    
    await prisma.apiToken.create({
      data: {
        userId: adminUser.id,
        name: 'Anthropic API',
        service: 'anthropic',
        encryptedToken: 'encrypted_anthropic_token_here',
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        isActive: true,
      },
    });

    await prisma.apiToken.create({
      data: {
        userId: regularUser.id,
        name: 'OpenAI API',
        service: 'openai',
        encryptedToken: 'encrypted_openai_token_here',
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        isActive: true,
      },
    });

    // Create containers
    console.log('🐳 Creating containers...');
    
    await prisma.container.create({
      data: {
        userId: adminUser.id,
        dockerId: 'docker-container-123',
        status: ContainerStatus.RUNNING,
        imageTag: 'latest',
        memoryLimit: 4096,
        cpuLimit: 4.0,
        diskLimit: 20480,
        internalIp: '172.20.0.10',
        port: 3000,
        lastHealthCheck: new Date(),
        healthStatus: 'healthy',
        resourceUsage: {
          cpu: 25.5,
          memory: 1024,
          disk: 5120,
        },
        startedAt: new Date(),
      },
    });

    await prisma.container.create({
      data: {
        userId: regularUser.id,
        dockerId: 'docker-container-456',
        status: ContainerStatus.STOPPED,
        imageTag: 'v1.2.3',
        memoryLimit: 2048,
        cpuLimit: 2.0,
        diskLimit: 10240,
        internalIp: '172.20.0.11',
        port: 3001,
        lastHealthCheck: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        healthStatus: 'unhealthy',
        resourceUsage: {
          cpu: 0,
          memory: 0,
          disk: 2560,
        },
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        stoppedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      },
    });

    // Create repositories
    console.log('📁 Creating repositories...');
    
    const repo1 = await prisma.repository.create({
      data: {
        userId: adminUser.id,
        githubId: 123456789,
        fullName: 'admin-user/awesome-project',
        name: 'awesome-project',
        owner: 'admin-user',
        private: false,
        canRead: true,
        canWrite: true,
        protectedBranches: ['main', 'develop'],
        defaultBranch: 'main',
        language: 'TypeScript',
        description: 'An awesome TypeScript project',
        url: 'https://github.com/admin-user/awesome-project',
        cloneUrl: 'https://github.com/admin-user/awesome-project.git',
        lastSyncedAt: new Date(),
      },
    });

    const repo2 = await prisma.repository.create({
      data: {
        userId: regularUser.id,
        githubId: 987654321,
        fullName: 'regular-user/my-app',
        name: 'my-app',
        owner: 'regular-user',
        private: true,
        canRead: true,
        canWrite: false,
        protectedBranches: ['main', 'master'],
        defaultBranch: 'main',
        language: 'JavaScript',
        description: 'My personal application',
        url: 'https://github.com/regular-user/my-app',
        cloneUrl: 'https://github.com/regular-user/my-app.git',
        lastSyncedAt: new Date(),
      },
    });

    // Create requests
    console.log('📝 Creating requests...');
    
    const request1 = await prisma.request.create({
      data: {
        userId: adminUser.id,
        command: 'git add . && git commit -m "Add new feature"',
        source: 'admin@aidev.platform',
        channel: NotificationChannel.EMAIL,
        rawMessage: 'Please add all changes and commit with message "Add new feature"',
        parsedCommand: 'git add . && git commit -m "Add new feature"',
        repositoryId: repo1.id,
        targetBranch: 'main',
        status: 'COMPLETED',
        confirmationRequired: true,
        confirmationToken: 'confirm-token-123',
        confirmedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        executionStartedAt: new Date(Date.now() - 9 * 60 * 1000), // 9 minutes ago
        executionEndedAt: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
        completedAt: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
        output: 'Changes added and committed successfully',
        exitCode: 0,
        sessionId: 'tmux-session-123',
        sourceIp: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });

    const request2 = await prisma.request.create({
      data: {
        userId: regularUser.id,
        command: 'npm install express',
        source: 'user@example.com',
        channel: NotificationChannel.WHATSAPP,
        rawMessage: 'Install express package',
        parsedCommand: 'npm install express',
        repositoryId: repo2.id,
        targetBranch: 'main',
        status: 'PENDING_CONFIRMATION',
        confirmationRequired: true,
        confirmationToken: 'confirm-token-456',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
        sourceIp: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    // Create confirmations
    console.log('✅ Creating confirmations...');
    
    await prisma.confirmation.create({
      data: {
        userId: adminUser.id,
        requestId: request1.id,
        type: 'EMAIL',
        token: 'confirm-token-123',
        confirmed: true,
        confirmedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        confirmedBy: '127.0.0.1',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      },
    });

    await prisma.confirmation.create({
      data: {
        userId: regularUser.id,
        requestId: request2.id,
        type: 'WHATSAPP',
        token: 'confirm-token-456',
        confirmed: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      },
    });

    // Create notifications
    console.log('🔔 Creating notifications...');
    
    await prisma.notification.create({
      data: {
        userId: adminUser.id,
        requestId: request1.id,
        channel: NotificationChannel.EMAIL,
        type: 'execution_completed',
        subject: 'Command executed successfully',
        content: 'Your command "git add . && git commit -m \\"Add new feature\\"" has been executed successfully.',
        metadata: {
          command: 'git add . && git commit -m "Add new feature"',
          exitCode: 0,
          duration: 60000, // 1 minute
        },
        sent: true,
        sentAt: new Date(Date.now() - 8 * 60 * 1000), // 8 minutes ago
        delivered: true,
        deliveredAt: new Date(Date.now() - 7 * 60 * 1000), // 7 minutes ago
      },
    });

    await prisma.notification.create({
      data: {
        userId: regularUser.id,
        requestId: request2.id,
        channel: NotificationChannel.WHATSAPP,
        type: 'confirmation_required',
        subject: 'Confirmation required',
        content: 'Please confirm execution of: npm install express',
        metadata: {
          command: 'npm install express',
          confirmationToken: 'confirm-token-456',
        },
        sent: true,
        sentAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        delivered: false,
      },
    });

    // Create notification settings
    console.log('⚙️ Creating notification settings...');
    
    await prisma.notificationSettings.create({
      data: {
        userId: adminUser.id,
        emailFallback: true,
        emailTimeout: 5,
        autoCancel: 15,
        pushEnabled: true,
      },
    });

    await prisma.notificationSettings.create({
      data: {
        userId: regularUser.id,
        emailFallback: false,
        emailTimeout: 10,
        autoCancel: 30,
        pushEnabled: false,
      },
    });

    // Create audit logs
    console.log('📋 Creating audit logs...');
    
    await prisma.auditLog.create({
      data: {
        userId: adminUser.id,
        requestId: request1.id,
        action: 'request_confirmed',
        details: {
          command: 'git add . && git commit -m "Add new feature"',
          repository: 'admin-user/awesome-project',
          branch: 'main',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: regularUser.id,
        action: 'login',
        details: {
          method: 'github_oauth',
          githubId: '87654321',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    // Create container sessions
    console.log('🖥️ Creating container sessions...');
    
    await prisma.containerSession.create({
      data: {
        containerId: 'docker-container-123',
        userId: adminUser.id,
        threadId: 'thread-123',
        repositoryId: repo1.id,
        sessionId: 'tmux-session-123',
        isActive: true,
        lastActivityAt: new Date(),
        cpuUsage: 25.5,
        memoryUsage: 1024,
        diskUsage: 5120,
        commitHash: 'abc123def456',
        filesModified: 3,
      },
    });

    console.log('✅ Database seeding completed successfully!');
    console.log(`📊 Created:`);
    console.log(`   - 2 users (1 admin, 1 regular)`);
    console.log(`   - 2 API tokens`);
    console.log(`   - 2 containers (1 running, 1 stopped)`);
    console.log(`   - 2 repositories`);
    console.log(`   - 2 requests (1 completed, 1 pending)`);
    console.log(`   - 2 confirmations`);
    console.log(`   - 2 notifications`);
    console.log(`   - 2 notification settings`);
    console.log(`   - 2 audit logs`);
    console.log(`   - 1 container session`);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  });
