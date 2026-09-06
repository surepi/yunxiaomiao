import { badRequest } from "../errors";

export interface ResourceLimits {
  memory?: number; // memory limit in MB
  cpuUsage?: number; // cpu limit in percent (e.g. 100 = one core)
  cpusetCpus?: string;
  maxSpace?: number; // disk limit in MB
  network?: number; // network weight/limit (daemon specific)
  uploadSpeedLimit?: number; // KB/s
  downloadSpeedLimit?: number; // KB/s
}

/**
 * Build the instance payload (a partial IGlobalInstanceConfig) sent to the panel
 * "buy" action. It starts from the package's quick-start template and overlays the
 * package's docker resource limits. Port mappings keep the daemon-side
 * placeholders ({mcsm_port1}, ...) so the daemon allocates host ports itself.
 */
export function buildPayload(setupInfoRaw: string, resourceLimitsRaw: string): Record<string, unknown> {
  let template: Record<string, unknown>;
  try {
    template = JSON.parse(setupInfoRaw) as Record<string, unknown>;
  } catch {
    throw badRequest("Package setupInfo is not valid JSON", "BAD_PACKAGE_TEMPLATE");
  }

  let limits: ResourceLimits = {};
  try {
    limits = resourceLimitsRaw ? (JSON.parse(resourceLimitsRaw) as ResourceLimits) : {};
  } catch {
    throw badRequest("Package resourceLimits is not valid JSON", "BAD_PACKAGE_LIMITS");
  }

  const payload: Record<string, unknown> = JSON.parse(JSON.stringify(template));
  const docker = (payload.docker as Record<string, unknown>) || {};

  if (limits.memory != null) docker.memory = limits.memory;
  if (limits.cpuUsage != null) docker.cpuUsage = limits.cpuUsage;
  if (limits.cpusetCpus != null) docker.cpusetCpus = limits.cpusetCpus;
  if (limits.maxSpace != null) docker.maxSpace = limits.maxSpace;
  if (limits.network != null) docker.network = limits.network;
  if (limits.uploadSpeedLimit != null) docker.uploadSpeedLimit = limits.uploadSpeedLimit;
  if (limits.downloadSpeedLimit != null) docker.downloadSpeedLimit = limits.downloadSpeedLimit;

  payload.docker = docker;
  // Let the daemon allocate a base port from its allocatable range.
  payload.basePort = 0;
  // The buy flow assigns category/nickname/endTime, so leave them unset here.
  delete payload.category;
  delete payload.nickname;
  delete payload.endTime;

  return payload;
}
