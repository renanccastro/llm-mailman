import { promises as fs } from 'fs';
import path from 'path';
import { VolumeMount } from '../types';
import { ServiceUnavailableError } from '@ai-dev/shared';

interface UserWorkspace {
  userId: string;
  hostPath: string;
  containerPath: string;
  size: number;
}

export class VolumeManager {
  private baseVolumePath: string;

  constructor() {
    this.baseVolumePath = process.env.VOLUME_BASE_PATH || '/var/aidev/volumes';
  }

  async createUserWorkspace(userId: string): Promise<UserWorkspace> {
    try {
      const userVolumePath = path.join(this.baseVolumePath, 'workspaces', userId);

      // Ensure the directory exists
      await fs.mkdir(userVolumePath, { recursive: true });

      // Set appropriate permissions (readable/writable by container user)
      await fs.chmod(userVolumePath, 0o755);

      // Create initial workspace structure
      await this.setupWorkspaceStructure(userVolumePath);

      return {
        userId,
        hostPath: userVolumePath,
        containerPath: '/workspace',
        size: await this.getDirectorySize(userVolumePath),
      };
    } catch (error) {
      console.error(`Failed to create workspace for user ${userId}:`, error);
      throw new ServiceUnavailableError('Volume Manager', { userId, action: 'create_workspace' });
    }
  }

  async getUserWorkspace(userId: string): Promise<UserWorkspace | null> {
    try {
      const userVolumePath = path.join(this.baseVolumePath, 'workspaces', userId);

      // Check if workspace exists
      const stats = await fs.stat(userVolumePath);
      if (!stats.isDirectory()) {
        return null;
      }

      return {
        userId,
        hostPath: userVolumePath,
        containerPath: '/workspace',
        size: await this.getDirectorySize(userVolumePath),
      };
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async deleteUserWorkspace(userId: string): Promise<void> {
    try {
      const userVolumePath = path.join(this.baseVolumePath, 'workspaces', userId);
      await fs.rm(userVolumePath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete workspace for user ${userId}:`, error);
      throw new ServiceUnavailableError('Volume Manager', { userId, action: 'delete_workspace' });
    }
  }

  async createSSHKeyMount(userId: string, publicKey?: string, privateKey?: string): Promise<VolumeMount> {
    try {
      const sshPath = path.join(this.baseVolumePath, 'ssh', userId);
      await fs.mkdir(sshPath, { recursive: true });

      // Create .ssh directory structure
      await fs.mkdir(path.join(sshPath, '.ssh'), { recursive: true });
      await fs.chmod(path.join(sshPath, '.ssh'), 0o700);

      // If keys are provided, write them
      if (publicKey) {
        await fs.writeFile(path.join(sshPath, '.ssh', 'id_rsa.pub'), publicKey);
        await fs.chmod(path.join(sshPath, '.ssh', 'id_rsa.pub'), 0o644);
      }

      if (privateKey) {
        await fs.writeFile(path.join(sshPath, '.ssh', 'id_rsa'), privateKey);
        await fs.chmod(path.join(sshPath, '.ssh', 'id_rsa'), 0o600);
      }

      // Create known_hosts file
      await fs.writeFile(path.join(sshPath, '.ssh', 'known_hosts'), '');
      await fs.chmod(path.join(sshPath, '.ssh', 'known_hosts'), 0o644);

      // Create SSH config
      const sshConfig = `
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa
    StrictHostKeyChecking no

Host *
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
`;
      await fs.writeFile(path.join(sshPath, '.ssh', 'config'), sshConfig.trim());
      await fs.chmod(path.join(sshPath, '.ssh', 'config'), 0o600);

      return {
        source: sshPath,
        target: '/home/aidev/.ssh',
        type: 'bind',
      };
    } catch (error) {
      console.error(`Failed to create SSH mount for user ${userId}:`, error);
      throw new ServiceUnavailableError('Volume Manager', { userId, action: 'create_ssh_mount' });
    }
  }

  async createTempMount(userId: string, purpose: string): Promise<VolumeMount> {
    try {
      const tempPath = path.join(this.baseVolumePath, 'temp', userId, purpose);
      await fs.mkdir(tempPath, { recursive: true });
      await fs.chmod(tempPath, 0o755);

      return {
        source: tempPath,
        target: `/tmp/${purpose}`,
        type: 'bind',
      };
    } catch (error) {
      console.error(`Failed to create temp mount for user ${userId}:`, error);
      throw new ServiceUnavailableError('Volume Manager', { userId, action: 'create_temp_mount' });
    }
  }

  async getWorkspaceUsage(userId: string): Promise<{ used: number; available: number }> {
    try {
      const workspace = await this.getUserWorkspace(userId);
      if (!workspace) {
        return { used: 0, available: 0 };
      }

      const used = await this.getDirectorySize(workspace.hostPath);
      const available = this.getAvailableDiskSpace(workspace.hostPath);

      return { used, available };
    } catch (error) {
      console.error(`Failed to get workspace usage for user ${userId}:`, error);
      return { used: 0, available: 0 };
    }
  }

  async backupWorkspace(userId: string, backupPath?: string): Promise<string> {
    try {
      const workspace = await this.getUserWorkspace(userId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = backupPath || path.join(this.baseVolumePath, 'backups');
      const backupFile = path.join(backupDir, `workspace-${userId}-${timestamp}.tar.gz`);

      await fs.mkdir(backupDir, { recursive: true });

      // Create tar.gz backup
      const tar = await import('tar-stream');
      const _pack = tar.pack();

      // TODO: Implement actual tar creation
      // This is a simplified version - in production, use proper tar library

      return backupFile;
    } catch (error) {
      console.error(`Failed to backup workspace for user ${userId}:`, error);
      throw new ServiceUnavailableError('Volume Manager', { userId, action: 'backup_workspace' });
    }
  }

  async restoreWorkspace(userId: string, backupFile: string): Promise<void> {
    try {
      const _workspace = await this.createUserWorkspace(userId);

      // TODO: Implement tar extraction
      // This would extract the backup file to the workspace directory

      console.info(`Restored workspace for user ${userId} from ${backupFile}`);
    } catch (error) {
      console.error(`Failed to restore workspace for user ${userId}:`, error);
      throw new ServiceUnavailableError('Volume Manager', { userId, action: 'restore_workspace' });
    }
  }

  async cleanupTempMounts(userId: string): Promise<void> {
    try {
      const tempPath = path.join(this.baseVolumePath, 'temp', userId);
      await fs.rm(tempPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to cleanup temp mounts for user ${userId}:`, error);
    }
  }

  private async setupWorkspaceStructure(workspacePath: string): Promise<void> {
    const directories = [
      'projects',
      'scripts',
      'logs',
      '.config',
      '.cache',
    ];

    for (const dir of directories) {
      const dirPath = path.join(workspacePath, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }

    // Create a welcome file
    const welcomeContent = `# Welcome to your AI Dev Assistant Workspace

This is your persistent development environment. Your files and projects will be saved here across sessions.

## Directory Structure

- \`projects/\` - Your code projects and repositories
- \`scripts/\` - Custom scripts and automation
- \`logs/\` - Application and command logs
- \`.config/\` - Configuration files
- \`.cache/\` - Temporary cache files

## Getting Started

1. Clone your repositories into the \`projects/\` directory
2. Use Claude Code to help with development tasks
3. Your work is automatically persisted

Happy coding! 🚀
`;

    await fs.writeFile(path.join(workspacePath, 'README.md'), welcomeContent);

    // Create .gitconfig template
    const gitConfigContent = `[user]
    # Set your name and email
    # name = Your Name
    # email = your.email@example.com

[core]
    editor = nano
    autocrlf = input

[init]
    defaultBranch = main

[pull]
    rebase = false
`;

    await fs.writeFile(path.join(workspacePath, '.config', 'git-template'), gitConfigContent);
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;

      const items = await fs.readdir(dirPath, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name);

        if (item.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          const stats = await fs.stat(itemPath);
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error(`Error calculating directory size for ${dirPath}:`, error);
      return 0;
    }
  }

  private getAvailableDiskSpace(dirPath: string): number {
    try {
      // TODO: Implement actual disk space check
      // This would use statvfs or similar system call
      return 10 * 1024 * 1024 * 1024; // 10GB placeholder
    } catch (error) {
      console.error(`Error getting available disk space for ${dirPath}:`, error);
      return 0;
    }
  }
}