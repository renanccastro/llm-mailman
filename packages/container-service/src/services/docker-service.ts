import Docker from 'dockerode';
import { EventEmitter } from 'events';
import {
  ContainerCreateOptions,
  ContainerInfo,
  ExecOptions,
  ExecResult,
  LogOptions,
  ContainerEvent,
  ResourceUsage
} from '../types';
import { ServiceUnavailableError, NotFoundError } from '@ai-dev/shared';

export class DockerService extends EventEmitter {
  private docker: Docker;
  private containers: Map<string, Docker.Container> = new Map();

  constructor() {
    super();
    const dockerSocket = process.env.DOCKER_SOCKET || process.env.DOCKER_HOST || '/var/run/docker.sock';
    this.docker = new Docker({
      socketPath: dockerSocket,
    });

    this.setupEventListener();
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async createContainer(options: ContainerCreateOptions): Promise<string> {
    try {
      const {
        userId,
        image = 'aidev/user-container:latest',
        name = `aidev-user-${userId}`,
        environment = {},
        volumes = [],
        resources = {},
        networkMode = 'bridge',
        workDir = '/workspace',
        command,
        entrypoint,
      } = options;

      // Prepare Docker configuration
      const containerConfig = {
        Image: image,
        name,
        WorkingDir: workDir,
        Env: Object.entries(environment).map(([key, value]) => `${key}=${value}`),
        Cmd: command,
        Entrypoint: entrypoint,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        HostConfig: {
          NetworkMode: networkMode,
          Memory: resources.memoryMB ? resources.memoryMB * 1024 * 1024 : undefined,
          CpuQuota: resources.cpuCores ? Math.floor(resources.cpuCores * 100000) : undefined,
          CpuPeriod: resources.cpuCores ? 100000 : undefined,
          Binds: volumes.map(v => `${v.source}:${v.target}${v.readonly ? ':ro' : ''}`),
          RestartPolicy: {
            Name: 'unless-stopped',
          },
          SecurityOpt: ['no-new-privileges:true'],
          ReadonlyRootfs: false,
          Tmpfs: {
            '/tmp': 'noexec,nosuid,size=100m',
          },
        },
        Labels: {
          'aidev.user-id': userId,
          'aidev.service': 'user-container',
          'aidev.created': new Date().toISOString(),
        },
      };

      const container = await this.docker.createContainer(containerConfig);
      this.containers.set(container.id, container);

      return container.id;
    } catch (error) {
      console.error('Failed to create container:', error);
      throw new ServiceUnavailableError('Docker', { originalError: error });
    }
  }

  async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.getContainer(containerId);
      await container.start();

      this.emit('container:started', { containerId });
    } catch (error) {
      console.error(`Failed to start container ${containerId}:`, error);
      throw new ServiceUnavailableError('Docker', { containerId, action: 'start' });
    }
  }

  async stopContainer(containerId: string, timeout = 10): Promise<void> {
    try {
      const container = this.getContainer(containerId);
      await container.stop({ t: timeout });

      this.emit('container:stopped', { containerId });
    } catch (error) {
      console.error(`Failed to stop container ${containerId}:`, error);
      throw new ServiceUnavailableError('Docker', { containerId, action: 'stop' });
    }
  }

  async removeContainer(containerId: string, force = false): Promise<void> {
    try {
      const container = this.getContainer(containerId);
      await container.remove({ force });

      this.containers.delete(containerId);
      this.emit('container:removed', { containerId });
    } catch (error) {
      console.error(`Failed to remove container ${containerId}:`, error);
      throw new ServiceUnavailableError('Docker', { containerId, action: 'remove' });
    }
  }

  async getContainerInfo(containerId: string): Promise<ContainerInfo> {
    try {
      const container = this.getContainer(containerId);
      const info = await container.inspect();

      return {
        id: info.Id,
        name: info.Name.substring(1), // Remove leading slash
        status: info.State.Status as any,
        image: info.Config.Image,
        created: new Date(info.Created),
        started: info.State.StartedAt ? new Date(info.State.StartedAt) : undefined,
        finished: info.State.FinishedAt ? new Date(info.State.FinishedAt) : undefined,
        ports: this.parsePortMappings(info.NetworkSettings.Ports),
        network: {
          networkId: Object.keys(info.NetworkSettings.Networks)[0] || '',
          ipAddress: info.NetworkSettings.IPAddress || undefined,
          gateway: info.NetworkSettings.Gateway || undefined,
          macAddress: info.NetworkSettings.MacAddress || undefined,
        },
      };
    } catch (error) {
      throw new NotFoundError('Container', containerId);
    }
  }

  async execCommand(options: ExecOptions): Promise<ExecResult> {
    const startTime = Date.now();

    try {
      const container = this.getContainer(options.containerId);

      const exec = await container.exec({
        Cmd: options.command,
        WorkingDir: options.workDir,
        Env: options.environment
          ? Object.entries(options.environment).map(([k, v]) => `${k}=${v}`)
          : undefined,
        User: options.user,
        AttachStdout: true,
        AttachStderr: true,
        AttachStdin: options.stdin || false,
        Tty: options.tty || false,
      });

      const stream = await exec.start({
        Detach: options.detach || false,
        Tty: options.tty || false,
      });

      let stdout = '';
      let stderr = '';

      if (!options.detach) {
        const chunks: Buffer[] = [];

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        await new Promise((resolve, reject) => {
          stream.on('end', resolve);
          stream.on('error', reject);
        });

        // Parse Docker multiplexed stream
        const output = Buffer.concat(chunks);
        let offset = 0;

        while (offset < output.length) {
          const header = output.slice(offset, offset + 8);
          if (header.length < 8) break;

          const streamType = header[0];
          const size = header.readUInt32BE(4);
          const data = output.slice(offset + 8, offset + 8 + size).toString();

          if (streamType === 1) stdout += data;
          if (streamType === 2) stderr += data;

          offset += 8 + size;
        }
      }

      const inspectResult = await exec.inspect();
      const duration = Date.now() - startTime;

      return {
        exitCode: inspectResult.ExitCode || 0,
        stdout,
        stderr,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Failed to execute command in container ${options.containerId}:`, error);

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  async getContainerLogs(options: LogOptions): Promise<NodeJS.ReadableStream> {
    try {
      const container = this.getContainer(options.containerId);

      const logs = await (container.logs as any)({
        follow: options.follow || false,
        stdout: true,
        stderr: true,
        tail: options.tail === 'all' ? 'all' : options.tail || 100,
        since: options.since ? Math.floor(options.since.getTime() / 1000) : undefined,
        until: options.until ? Math.floor(options.until.getTime() / 1000) : undefined,
        timestamps: options.timestamps || false,
      });

      return logs as NodeJS.ReadableStream;
    } catch (error) {
      throw new NotFoundError('Container', options.containerId);
    }
  }

  async getResourceUsage(containerId: string): Promise<ResourceUsage> {
    try {
      const container = this.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
        (stats.precpu_stats.cpu_usage?.total_usage || 0);
      const systemDelta = stats.cpu_stats.system_cpu_usage -
        (stats.precpu_stats.system_cpu_usage || 0);
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

      // Memory usage
      const memoryUsage = stats.memory_stats.usage || 0;
      const memoryLimit = stats.memory_stats.limit || 0;

      // Network I/O
      const networks = Object.values(stats.networks || {}) as any[];
      const networkRx = networks.reduce((sum, net) => sum + (net.rx_bytes || 0), 0);
      const networkTx = networks.reduce((sum, net) => sum + (net.tx_bytes || 0), 0);

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsageMB: Math.round(memoryUsage / 1024 / 1024),
        memoryLimitMB: Math.round(memoryLimit / 1024 / 1024),
        diskUsageMB: 0, // TODO: Implement disk usage calculation
        networkRxMB: Math.round(networkRx / 1024 / 1024),
        networkTxMB: Math.round(networkTx / 1024 / 1024),
      };
    } catch (error) {
      throw new NotFoundError('Container', containerId);
    }
  }

  private getContainer(containerId: string): Docker.Container {
    let container = this.containers.get(containerId);

    if (!container) {
      container = this.docker.getContainer(containerId);
      this.containers.set(containerId, container);
    }

    return container;
  }

  private parsePortMappings(ports: any) {
    const mappings = [];

    for (const [containerPort, hostPorts] of Object.entries(ports || {})) {
      if (Array.isArray(hostPorts)) {
        const [port, protocol] = containerPort.split('/');
        for (const hostPort of hostPorts) {
          mappings.push({
            containerPort: parseInt(port),
            hostPort: parseInt((hostPort as any).HostPort),
            protocol: protocol as 'tcp' | 'udp',
          });
        }
      }
    }

    return mappings;
  }

  private setupEventListener(): void {
    this.docker.getEvents({}, (err, stream) => {
      if (err || !stream) {
        console.error('Failed to listen to Docker events:', err);
        return;
      }

      stream.on('data', (chunk) => {
        try {
          const event = JSON.parse(chunk.toString());

          if (event.Type === 'container' && event.Actor?.Attributes?.['aidev.service'] === 'user-container') {
            const containerEvent: ContainerEvent = {
              type: event.Action as any,
              containerId: event.Actor.ID,
              timestamp: new Date(event.time * 1000),
              data: event.Actor.Attributes,
            };

            this.emit('container:event', containerEvent);
          }
        } catch (error) {
          console.error('Failed to parse Docker event:', error);
        }
      });

      stream.on('error', (error) => {
        console.error('Docker events stream error:', error);
      });
    });
  }
}