import { EventEmitter } from 'events';
import { prisma, ContainerStatus } from '@ai-dev/database';
import { DockerService } from './docker-service';
import { KubernetesService } from './kubernetes-service';
import { VolumeManager } from './volume-manager';
import {
  ContainerCreateOptions,
  ContainerInfo,
  ExecOptions,
  ExecResult,
  ResourceUsage,
  KubernetesOptions
} from '../types';
import { ServiceUnavailableError, NotFoundError, Constants } from '@ai-dev/shared';

export class ContainerManager extends EventEmitter {
  private dockerService: DockerService;
  private kubernetesService: KubernetesService;
  private volumeManager: VolumeManager;
  private useKubernetes: boolean;

  constructor() {
    super();
    this.dockerService = new DockerService();
    this.kubernetesService = new KubernetesService();
    this.volumeManager = new VolumeManager();
    this.useKubernetes = process.env.NODE_ENV === 'production';

    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    // Check which container runtime is available
    const dockerAvailable = await this.dockerService.isAvailable();
    const k8sAvailable = await this.kubernetesService.isAvailable();

    if (this.useKubernetes && !k8sAvailable) {
      console.warn('Kubernetes not available, falling back to Docker');
      this.useKubernetes = false;
    }

    if (!this.useKubernetes && !dockerAvailable) {
      throw new ServiceUnavailableError('Container runtime',
        'Neither Kubernetes nor Docker is available');
    }

    console.info(`Container runtime: ${this.useKubernetes ? 'Kubernetes' : 'Docker'}`);
  }

  async createUserContainer(userId: string, options: Partial<ContainerCreateOptions> = {}): Promise<string> {
    try {
      // Check if user already has a container
      const existingContainer = await prisma.container.findUnique({
        where: { userId },
      });

      if (existingContainer && existingContainer.status === ContainerStatus.RUNNING) {
        return existingContainer.id;
      }

      // Create user workspace volume
      const workspaceVolume = await this.volumeManager.createUserWorkspace(userId);

      // Prepare container options
      const containerOptions: ContainerCreateOptions = {
        userId,
        image: 'aidev/user-container:latest',
        name: `aidev-user-${userId}`,
        environment: {
          USER_ID: userId,
          WORKSPACE_PATH: '/workspace',
          NODE_ENV: process.env.NODE_ENV || 'development',
          ...options.environment,
        },
        volumes: [
          {
            source: workspaceVolume.hostPath,
            target: '/workspace',
            type: 'bind',
          },
          {
            source: `/tmp/aidev-ssh-${userId}`,
            target: '/home/aidev/.ssh',
            type: 'bind',
          },
          ...options.volumes || [],
        ],
        resources: {
          memoryMB: options.resources?.memoryMB || Constants.DEFAULT_MEMORY_LIMIT,
          cpuCores: options.resources?.cpuCores || Constants.DEFAULT_CPU_LIMIT,
          diskMB: options.resources?.diskMB || Constants.DEFAULT_DISK_LIMIT,
        },
        ...options,
      };

      // Create container using appropriate service
      let containerId: string;
      if (this.useKubernetes) {
        const k8sOptions: KubernetesOptions = {
          namespace: 'aidev-users',
          labels: {
            'aidev.user-id': userId,
            'aidev.container-type': 'user-workspace',
          },
        };
        containerId = await this.kubernetesService.createContainer(containerOptions, k8sOptions);
      } else {
        containerId = await this.dockerService.createContainer(containerOptions);
      }

      // Store container info in database
      const container = await prisma.container.upsert({
        where: { userId },
        update: {
          dockerId: this.useKubernetes ? null : containerId,
          kubernetesName: this.useKubernetes ? containerId : null,
          status: ContainerStatus.CREATING,
          memoryLimit: containerOptions.resources?.memoryMB || Constants.DEFAULT_MEMORY_LIMIT,
          cpuLimit: containerOptions.resources?.cpuCores || Constants.DEFAULT_CPU_LIMIT,
          diskLimit: containerOptions.resources?.diskMB || Constants.DEFAULT_DISK_LIMIT,
          updatedAt: new Date(),
        },
        create: {
          userId,
          dockerId: this.useKubernetes ? null : containerId,
          kubernetesName: this.useKubernetes ? containerId : null,
          status: ContainerStatus.CREATING,
          memoryLimit: containerOptions.resources?.memoryMB || Constants.DEFAULT_MEMORY_LIMIT,
          cpuLimit: containerOptions.resources?.cpuCores || Constants.DEFAULT_CPU_LIMIT,
          diskLimit: containerOptions.resources?.diskMB || Constants.DEFAULT_DISK_LIMIT,
        },
      });

      // Start the container
      await this.startContainer(userId);

      this.emit('container:created', { userId, containerId: container.id });
      return container.id;
    } catch (error) {
      console.error(`Failed to create container for user ${userId}:`, error);
      throw error;
    }
  }

  async startContainer(userId: string): Promise<void> {
    const container = await this.getUserContainer(userId);

    try {
      const runtimeId = container.dockerId || container.kubernetesName;
      if (!runtimeId) {
        throw new Error('Container runtime ID not found');
      }

      if (this.useKubernetes) {
        await this.kubernetesService.startContainer(runtimeId);
      } else {
        await this.dockerService.startContainer(runtimeId);
      }

      await prisma.container.update({
        where: { id: container.id },
        data: {
          status: ContainerStatus.RUNNING,
          startedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.emit('container:started', { userId, containerId: container.id });
    } catch (error) {
      await prisma.container.update({
        where: { id: container.id },
        data: {
          status: ContainerStatus.FAILED,
          updatedAt: new Date(),
        },
      });
      throw error;
    }
  }

  async stopContainer(userId: string): Promise<void> {
    const container = await this.getUserContainer(userId);

    try {
      const runtimeId = container.dockerId || container.kubernetesName;
      if (!runtimeId) {
        throw new Error('Container runtime ID not found');
      }

      if (this.useKubernetes) {
        await this.kubernetesService.stopContainer(runtimeId);
      } else {
        await this.dockerService.stopContainer(runtimeId);
      }

      await prisma.container.update({
        where: { id: container.id },
        data: {
          status: ContainerStatus.STOPPED,
          stoppedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.emit('container:stopped', { userId, containerId: container.id });
    } catch (error) {
      console.error(`Failed to stop container for user ${userId}:`, error);
      throw error;
    }
  }

  async restartContainer(userId: string): Promise<void> {
    await this.stopContainer(userId);
    await this.startContainer(userId);
  }

  async removeContainer(userId: string): Promise<void> {
    const container = await this.getUserContainer(userId);

    try {
      const runtimeId = container.dockerId || container.kubernetesName;
      if (runtimeId) {
        if (this.useKubernetes) {
          await this.kubernetesService.removeContainer(runtimeId);
        } else {
          await this.dockerService.removeContainer(runtimeId);
        }
      }

      await prisma.container.update({
        where: { id: container.id },
        data: {
          status: ContainerStatus.TERMINATED,
          stoppedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.emit('container:removed', { userId, containerId: container.id });
    } catch (error) {
      console.error(`Failed to remove container for user ${userId}:`, error);
      throw error;
    }
  }

  async getContainerStatus(userId: string): Promise<ContainerInfo> {
    const container = await this.getUserContainer(userId);

    try {
      const runtimeId = container.dockerId || container.kubernetesName;
      if (!runtimeId) {
        throw new Error('Container runtime ID not found');
      }

      let containerInfo: ContainerInfo;
      if (this.useKubernetes) {
        containerInfo = await this.kubernetesService.getContainerInfo(runtimeId);
      } else {
        containerInfo = await this.dockerService.getContainerInfo(runtimeId);
      }

      // Update health check timestamp
      await prisma.container.update({
        where: { id: container.id },
        data: {
          lastHealthCheck: new Date(),
          healthStatus: containerInfo.status,
        },
      });

      return containerInfo;
    } catch (error) {
      console.error(`Failed to get container status for user ${userId}:`, error);
      throw error;
    }
  }

  async executeCommand(userId: string, command: string[], options: Partial<ExecOptions> = {}): Promise<ExecResult> {
    const container = await this.getUserContainer(userId);

    const runtimeId = container.dockerId || container.kubernetesName;
    if (!runtimeId) {
      throw new Error('Container runtime ID not found');
    }

    const execOptions: ExecOptions = {
      containerId: runtimeId,
      command,
      workDir: '/workspace',
      tty: true,
      ...options,
    };

    if (this.useKubernetes) {
      return await this.kubernetesService.execCommand(execOptions);
    } else {
      return await this.dockerService.execCommand(execOptions);
    }
  }

  async getContainerLogs(userId: string, tail: number = 100): Promise<NodeJS.ReadableStream> {
    const container = await this.getUserContainer(userId);

    const runtimeId = container.dockerId || container.kubernetesName;
    if (!runtimeId) {
      throw new Error('Container runtime ID not found');
    }

    if (this.useKubernetes) {
      // TODO: Implement Kubernetes logs
      throw new Error('Kubernetes logs not yet implemented');
    } else {
      return await this.dockerService.getContainerLogs({
        containerId: runtimeId,
        tail,
        follow: false,
        timestamps: true,
      });
    }
  }

  async getResourceUsage(userId: string): Promise<ResourceUsage> {
    const container = await this.getUserContainer(userId);

    const runtimeId = container.dockerId || container.kubernetesName;
    if (!runtimeId) {
      throw new Error('Container runtime ID not found');
    }

    let usage: ResourceUsage;
    if (this.useKubernetes) {
      usage = await this.kubernetesService.getResourceUsage(runtimeId);
    } else {
      usage = await this.dockerService.getResourceUsage(runtimeId);
    }

    // Store usage in database
    await prisma.container.update({
      where: { id: container.id },
      data: {
        resourceUsage: usage as any,
        updatedAt: new Date(),
      },
    });

    return usage;
  }

  async cleanupExpiredContainers(): Promise<void> {
    const expiredContainers = await prisma.container.findMany({
      where: {
        status: ContainerStatus.RUNNING,
        startedAt: {
          lt: new Date(Date.now() - Constants.MAX_CONTAINER_LIFETIME * 1000),
        },
      },
    });

    for (const container of expiredContainers) {
      try {
        await this.stopContainer(container.userId);
        console.info(`Stopped expired container for user ${container.userId}`);
      } catch (error) {
        console.error(`Failed to stop expired container for user ${container.userId}:`, error);
      }
    }
  }

  private async getUserContainer(userId: string) {
    const container = await prisma.container.findUnique({
      where: { userId },
    });

    if (!container) {
      throw new NotFoundError('Container', userId);
    }

    return container;
  }

  private setupEventHandlers(): void {
    // Docker events
    this.dockerService.on('container:started', (data) => {
      this.emit('container:runtime:started', data);
    });

    this.dockerService.on('container:stopped', (data) => {
      this.emit('container:runtime:stopped', data);
    });

    this.dockerService.on('container:removed', (data) => {
      this.emit('container:runtime:removed', data);
    });

    // Kubernetes events
    this.kubernetesService.on('container:starting', (data) => {
      this.emit('container:runtime:starting', data);
    });

    this.kubernetesService.on('container:stopped', (data) => {
      this.emit('container:runtime:stopped', data);
    });

    this.kubernetesService.on('container:removed', (data) => {
      this.emit('container:runtime:removed', data);
    });
  }
}