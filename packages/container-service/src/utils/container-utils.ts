import { ContainerInfo, ResourceUsage } from '../types';

export class ContainerUtils {
  static sanitizeContainerName(name: string): string {
    // Replace invalid characters with hyphens and ensure it starts with a letter
    return name
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/^[^a-zA-Z]/, 'container-')
      .toLowerCase()
      .substring(0, 63); // Kubernetes name limit
  }

  static generateContainerLabels(userId: string, additionalLabels: Record<string, string> = {}): Record<string, string> {
    return {
      'app': 'aidev-user-container',
      'aidev.user-id': userId,
      'aidev.service': 'user-container',
      'aidev.version': '1.0.0',
      'aidev.created': new Date().toISOString(),
      ...additionalLabels,
    };
  }

  static parseResourceLimits(limits: string): { memory?: number; cpu?: number } {
    const result: { memory?: number; cpu?: number } = {};

    // Parse memory (e.g., "2048Mi", "2Gi")
    const memoryMatch = limits.match(/(\d+)(Mi|Gi|M|G)/i);
    if (memoryMatch) {
      const [, value, unit] = memoryMatch;
      const numValue = parseInt(value);

      switch (unit.toLowerCase()) {
        case 'gi':
        case 'g':
          result.memory = numValue * 1024;
          break;
        case 'mi':
        case 'm':
          result.memory = numValue;
          break;
      }
    }

    // Parse CPU (e.g., "2", "2000m")
    const cpuMatch = limits.match(/(\d+)(m)?/);
    if (cpuMatch) {
      const [, value, unit] = cpuMatch;
      const numValue = parseInt(value);

      if (unit === 'm') {
        result.cpu = numValue / 1000; // millicores to cores
      } else {
        result.cpu = numValue;
      }
    }

    return result;
  }

  static formatResourceUsage(usage: ResourceUsage): string {
    const memoryPercent = usage.memoryLimitMB > 0
      ? Math.round((usage.memoryUsageMB / usage.memoryLimitMB) * 100)
      : 0;

    return [
      `CPU: ${usage.cpuPercent.toFixed(1)}%`,
      `Memory: ${usage.memoryUsageMB}MB / ${usage.memoryLimitMB}MB (${memoryPercent}%)`,
      `Disk: ${usage.diskUsageMB}MB`,
      `Network: ↓${usage.networkRxMB}MB ↑${usage.networkTxMB}MB`,
    ].join(' | ');
  }

  static isContainerHealthy(container: ContainerInfo): boolean {
    const healthyStates = ['running'];
    return healthyStates.includes(container.status);
  }

  static getContainerUptime(container: ContainerInfo): number {
    if (!container.started) {
      return 0;
    }

    return Date.now() - container.started.getTime();
  }

  static formatUptime(uptimeMs: number): string {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  static generateEnvironmentVariables(userId: string, customEnv: Record<string, string> = {}): Record<string, string> {
    return {
      // User identification
      AIDEV_USER_ID: userId,

      // Container environment
      CONTAINER_TYPE: 'user-workspace',
      WORKSPACE_PATH: '/workspace',

      // Development tools configuration
      NODE_ENV: process.env.NODE_ENV || 'development',
      TERM: 'xterm-256color',
      SHELL: '/bin/bash',

      // Git configuration
      GIT_EDITOR: 'nano',

      // Python configuration
      PYTHONUNBUFFERED: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',

      // Node.js configuration
      NPM_CONFIG_UPDATE_NOTIFIER: 'false',

      // Custom environment variables
      ...customEnv,
    };
  }

  static validateResourceLimits(resources: { memoryMB?: number; cpuCores?: number; diskMB?: number }): boolean {
    const { memoryMB = 0, cpuCores = 0, diskMB = 0 } = resources;

    // Check maximum limits
    const MAX_MEMORY_MB = 8192; // 8GB
    const MAX_CPU_CORES = 4;
    const MAX_DISK_MB = 102400; // 100GB

    if (memoryMB > MAX_MEMORY_MB) {
      throw new Error(`Memory limit exceeds maximum allowed: ${MAX_MEMORY_MB}MB`);
    }

    if (cpuCores > MAX_CPU_CORES) {
      throw new Error(`CPU limit exceeds maximum allowed: ${MAX_CPU_CORES} cores`);
    }

    if (diskMB > MAX_DISK_MB) {
      throw new Error(`Disk limit exceeds maximum allowed: ${MAX_DISK_MB}MB`);
    }

    return true;
  }

  static createHealthCheckCommand(): string[] {
    return [
      'bash',
      '-c',
      'ps aux | grep -v grep | grep -q bash && echo "Container is healthy" || exit 1'
    ];
  }

  static createRestartPolicy(policy: 'no' | 'always' | 'unless-stopped' | 'on-failure' = 'unless-stopped') {
    return {
      Name: policy,
      MaximumRetryCount: policy === 'on-failure' ? 3 : undefined,
    };
  }

  static getSecurityOptions(): string[] {
    return [
      'no-new-privileges:true',
      'seccomp:unconfined', // Allow some system calls for development
    ];
  }

  static createNetworkAliases(userId: string): string[] {
    return [
      `user-${userId}`,
      `workspace-${userId}`,
    ];
  }

  static parseDockerOutput(output: string): { stdout: string; stderr: string } {
    const lines = output.split('\n');
    const stdout: string[] = [];
    const stderr: string[] = [];

    for (const line of lines) {
      if (line.includes('STDERR:')) {
        stderr.push(line.replace('STDERR:', '').trim());
      } else {
        stdout.push(line);
      }
    }

    return {
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
    };
  }

  static createTmpfsOptions(): Record<string, string> {
    return {
      '/tmp': 'noexec,nosuid,size=100m',
      '/var/tmp': 'noexec,nosuid,size=50m',
    };
  }

  static generateWorkingDirectory(_userId: string, project?: string): string {
    if (project) {
      return `/workspace/projects/${project}`;
    }
    return '/workspace';
  }
}