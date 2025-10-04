export interface ContainerCreateOptions {
  userId: string;
  image?: string;
  name?: string;
  environment?: Record<string, string>;
  volumes?: VolumeMount[];
  resources?: ResourceLimits;
  networkMode?: string;
  workDir?: string;
  command?: string[];
  entrypoint?: string[];
  labels?: Record<string, string>;
}

export interface VolumeMount {
  source: string;
  target: string;
  readonly?: boolean;
  type?: 'bind' | 'volume' | 'tmpfs';
}

export interface ResourceLimits {
  memoryMB?: number;
  cpuCores?: number;
  diskMB?: number;
  swapMB?: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: 'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead';
  image: string;
  created: Date;
  started?: Date;
  finished?: Date;
  ports?: PortMapping[];
  network?: NetworkInfo;
  resources?: ResourceUsage;
}

export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol?: 'tcp' | 'udp';
}

export interface NetworkInfo {
  networkId: string;
  ipAddress?: string;
  gateway?: string;
  macAddress?: string;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryUsageMB: number;
  memoryLimitMB: number;
  diskUsageMB: number;
  networkRxMB: number;
  networkTxMB: number;
}

export interface ExecOptions {
  containerId: string;
  command: string[];
  workDir?: string;
  environment?: Record<string, string>;
  user?: string;
  detach?: boolean;
  tty?: boolean;
  stdin?: boolean;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  output?: string;
  duration: number;
}

export interface LogOptions {
  containerId: string;
  follow?: boolean;
  tail?: number | 'all';
  since?: Date;
  until?: Date;
  timestamps?: boolean;
}

export interface ContainerEvent {
  type: 'start' | 'stop' | 'die' | 'kill' | 'restart' | 'pause' | 'unpause' | 'destroy';
  containerId: string;
  timestamp: Date;
  data?: Record<string, any>;
}

export interface KubernetesOptions {
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  nodeSelector?: Record<string, string>;
  tolerations?: Array<{
    key: string;
    operator: 'Equal' | 'Exists';
    value?: string;
    effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
  }>;
}