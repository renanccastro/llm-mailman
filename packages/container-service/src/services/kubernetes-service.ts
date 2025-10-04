import * as k8s from '@kubernetes/client-node';
import { EventEmitter } from 'events';
import {
  ContainerCreateOptions,
  ContainerInfo,
  ExecOptions,
  ExecResult,
  KubernetesOptions,
  ResourceUsage
} from '../types';
import { ServiceUnavailableError, NotFoundError } from '@ai-dev/shared';

export class KubernetesService extends EventEmitter {
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private _k8sAppsApi: k8s.AppsV1Api;
  private k8sMetricsApi: k8s.Metrics;
  private namespace: string;

  constructor() {
    super();
    this.namespace = process.env.KUBE_NAMESPACE || 'aidev-users';

    this.kc = new k8s.KubeConfig();

    if (process.env.NODE_ENV === 'production') {
      this.kc.loadFromCluster();
    } else {
      this.kc.loadFromDefault();
    }

    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this._k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.k8sMetricsApi = new k8s.Metrics(this.kc);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.k8sApi.listNamespace();
      return true;
    } catch {
      return false;
    }
  }

  async createContainer(
    options: ContainerCreateOptions,
    k8sOptions: KubernetesOptions = {}
  ): Promise<string> {
    try {
      const {
        userId,
        image = 'aidev/user-container:latest',
        name = `aidev-user-${userId}`,
        environment = {},
        volumes = [],
        resources = {},
        workDir = '/workspace',
        command,
        entrypoint,
      } = options;

      const podName = `${name}-${Date.now()}`;
      const labels = {
        'app': 'aidev-user-container',
        'aidev.user-id': userId,
        'aidev.service': 'user-container',
        ...k8sOptions.labels,
      };

      // Create persistent volume claim for user workspace
      const pvcName = `workspace-${userId}`;
      await this.ensurePVC(pvcName, '10Gi');

      // Create pod manifest
      const pod: k8s.V1Pod = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          name: podName,
          namespace: this.namespace,
          labels,
          annotations: {
            'aidev.created': new Date().toISOString(),
            ...k8sOptions.annotations,
          },
        },
        spec: {
          restartPolicy: 'Always',
          nodeSelector: k8sOptions.nodeSelector,
          tolerations: k8sOptions.tolerations,
          containers: [
            {
              name: 'user-container',
              image,
              workingDir: workDir,
              command: entrypoint,
              args: command,
              env: Object.entries(environment).map(([name, value]) => ({ name, value })),
              resources: {
                requests: {
                  memory: resources.memoryMB ? `${resources.memoryMB}Mi` : '512Mi',
                  cpu: resources.cpuCores ? `${resources.cpuCores}` : '0.5',
                },
                limits: {
                  memory: resources.memoryMB ? `${resources.memoryMB}Mi` : '2048Mi',
                  cpu: resources.cpuCores ? `${resources.cpuCores}` : '2',
                },
              },
              volumeMounts: [
                {
                  name: 'workspace',
                  mountPath: '/workspace',
                },
                ...volumes.map(v => ({
                  name: v.source.replace(/[^a-z0-9-]/g, '-'),
                  mountPath: v.target,
                  readOnly: v.readonly,
                })),
              ],
              securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                runAsGroup: 1000,
                allowPrivilegeEscalation: false,
                capabilities: {
                  drop: ['ALL'],
                },
                readOnlyRootFilesystem: false,
              },
              stdin: true,
              tty: true,
            },
          ],
          volumes: [
            {
              name: 'workspace',
              persistentVolumeClaim: {
                claimName: pvcName,
              },
            },
            ...volumes.map(v => ({
              name: v.source.replace(/[^a-z0-9-]/g, '-'),
              hostPath: {
                path: v.source,
              },
            })),
          ],
          securityContext: {
            fsGroup: 1000,
          },
        },
      };

      const response = await this.k8sApi.createNamespacedPod(this.namespace, pod);
      return response.body.metadata?.name || podName;
    } catch (error) {
      console.error('Failed to create Kubernetes pod:', error);
      throw new ServiceUnavailableError('Kubernetes', { originalError: error });
    }
  }

  async startContainer(podName: string): Promise<void> {
    // Pods start automatically when created in Kubernetes
    // This method can be used to patch the pod if needed
    try {
      const pod = await this.k8sApi.readNamespacedPod(podName, this.namespace);

      if (pod.body.status?.phase === 'Pending') {
        // Pod is starting, emit event
        this.emit('container:starting', { containerId: podName });
      }
    } catch (error) {
      throw new NotFoundError('Pod', podName);
    }
  }

  async stopContainer(podName: string): Promise<void> {
    try {
      await this.k8sApi.deleteNamespacedPod(podName, this.namespace, undefined, undefined, 30);
      this.emit('container:stopped', { containerId: podName });
    } catch (error) {
      console.error(`Failed to stop pod ${podName}:`, error);
      throw new ServiceUnavailableError('Kubernetes', { podName, action: 'stop' });
    }
  }

  async removeContainer(podName: string): Promise<void> {
    try {
      await this.k8sApi.deleteNamespacedPod(podName, this.namespace);
      this.emit('container:removed', { containerId: podName });
    } catch (error) {
      console.error(`Failed to remove pod ${podName}:`, error);
      throw new ServiceUnavailableError('Kubernetes', { podName, action: 'remove' });
    }
  }

  async getContainerInfo(podName: string): Promise<ContainerInfo> {
    try {
      const response = await this.k8sApi.readNamespacedPod(podName, this.namespace);
      const pod = response.body;

      const container = pod.spec?.containers?.[0];
      const status = pod.status?.containerStatuses?.[0];

      return {
        id: pod.metadata?.name || podName,
        name: pod.metadata?.name || podName,
        status: this.mapPodPhaseToStatus(pod.status?.phase),
        image: container?.image || '',
        created: new Date(pod.metadata?.creationTimestamp || Date.now()),
        started: status?.state?.running?.startedAt
          ? new Date(status.state.running.startedAt)
          : undefined,
        ports: [], // TODO: Extract port mappings from service
        network: {
          networkId: pod.spec?.nodeName || '',
          ipAddress: pod.status?.podIP,
        },
      };
    } catch (error) {
      throw new NotFoundError('Pod', podName);
    }
  }

  async execCommand(options: ExecOptions): Promise<ExecResult> {
    const startTime = Date.now();

    try {
      const exec = new k8s.Exec(this.kc);
      let stdout = '';
      let stderr = '';

      await exec.exec(
        this.namespace,
        options.containerId,
        'user-container',
        options.command,
        process.stdout,
        process.stderr,
        process.stdin,
        options.tty || false,
        (_status) => {
          // Command finished
        }
      );

      const duration = Date.now() - startTime;

      return {
        exitCode: 0, // TODO: Get actual exit code
        stdout,
        stderr,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Failed to execute command in pod ${options.containerId}:`, error);

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        duration,
      };
    }
  }

  async getResourceUsage(podName: string): Promise<ResourceUsage> {
    try {
      const metrics = await this.k8sMetricsApi.getPodMetrics(this.namespace, podName);
      const container = metrics.containers[0];

      if (!container) {
        throw new Error('No container metrics found');
      }

      // Parse resource usage
      const cpuUsage = this.parseQuantity(container.usage.cpu);
      const memoryUsage = this.parseQuantity(container.usage.memory);

      return {
        cpuPercent: cpuUsage * 100, // Convert to percentage
        memoryUsageMB: Math.round(memoryUsage / 1024 / 1024),
        memoryLimitMB: 2048, // TODO: Get from pod spec
        diskUsageMB: 0, // TODO: Implement disk usage
        networkRxMB: 0, // TODO: Implement network metrics
        networkTxMB: 0,
      };
    } catch (error) {
      throw new NotFoundError('Pod metrics', podName);
    }
  }

  private async ensurePVC(name: string, size: string): Promise<void> {
    try {
      await this.k8sApi.readNamespacedPersistentVolumeClaim(name, this.namespace);
    } catch {
      // PVC doesn't exist, create it
      const pvc: k8s.V1PersistentVolumeClaim = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name,
          namespace: this.namespace,
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          resources: {
            requests: {
              storage: size,
            },
          },
        },
      };

      await this.k8sApi.createNamespacedPersistentVolumeClaim(this.namespace, pvc);
    }
  }

  private mapPodPhaseToStatus(phase?: string): ContainerInfo['status'] {
    switch (phase) {
      case 'Pending':
        return 'created';
      case 'Running':
        return 'running';
      case 'Succeeded':
        return 'exited';
      case 'Failed':
        return 'exited';
      default:
        return 'created';
    }
  }

  private parseQuantity(quantity: string): number {
    // Simple quantity parser for CPU and memory
    const match = quantity.match(/^(\d+(?:\.\d+)?)([a-zA-Z]*)$/);
    if (!match) return 0;

    const [, value, unit] = match;
    const numValue = parseFloat(value);

    switch (unit.toLowerCase()) {
      case 'ki':
        return numValue * 1024;
      case 'mi':
        return numValue * 1024 * 1024;
      case 'gi':
        return numValue * 1024 * 1024 * 1024;
      case 'm': // millicores
        return numValue / 1000;
      default:
        return numValue;
    }
  }
}