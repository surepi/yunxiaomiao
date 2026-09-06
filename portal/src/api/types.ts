export interface Package {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceFen: number;
  hours: number;
  active: boolean;
}

export interface InstancePort {
  host: number;
  container: number;
  protocol: string;
}

export interface MyInstance {
  instance_id: string;
  name: string;
  status: number;
  expire: number;
  ports: InstancePort[];
  lines: Array<{ title: string; value: unknown }>;
  daemonId: string;
  expireAt: string | null;
  managed: boolean;
  nodeHost: string;
  nodeName: string;
}

export interface RedeemResult {
  instanceId: string;
  daemonId: string;
  nodeRemarks: string;
  expire: number;
  instanceInfo?: unknown;
}

export interface NodeOption {
  id: string;
  name: string;
  running: number;
  instances: number;
}
