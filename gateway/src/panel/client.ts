import axios, { AxiosInstance, Method } from "axios";
import { config } from "../config";
import { upstream } from "../errors";
import { logger } from "../logger";

// MCSManager panel wraps every JSON response in { status, data, time }.
// Errors are returned as { status: 4xx/5xx, data: "<message>", time } and we
// treat any non-200 envelope as a failure.
interface PanelEnvelope<T = unknown> {
  status: number;
  data: T;
  time?: number;
}

export interface PanelNode {
  uuid: string;
  ip: string;
  port: number;
  prefix?: string;
  available: boolean;
  remarks?: string;
}

export interface NodeStatus {
  name: string;
  id: string;
  ip: string;
  port: number;
  available: boolean;
  running: number;
  instances: number;
}

export interface BuyResult {
  instance_id: string;
  instance_config: Record<string, unknown>;
  username: string;
  password: string;
  uuid: string;
  expire: number;
  instance_info?: InstanceInfo;
}

export interface InstancePort {
  host: number;
  container: number;
  protocol: string;
}

export interface InstanceInfo {
  instance_id: string;
  name: string;
  status: number;
  expire: number;
  ports: InstancePort[];
  lines: Array<{ title: string; value: unknown }>;
}

export interface BuyParams {
  category_id: number;
  node_id: string;
  username: string;
  hours: number;
  payload: Record<string, unknown>;
}

export interface RenewParams {
  category_id: number;
  node_id: string;
  instance_id: string;
  hours: number;
}


export interface QuickStartTemplate {
  title: string;
  description?: string;
  language?: string;
  gameType?: string;
  category?: string;
  platform?: string;
  runtime?: string;
  author?: string;
  setupInfo: Record<string, unknown>;
}

// Raw market payload returned by /api/instance/quick_install_list. On failure
// the panel returns an empty array instead of this object.
interface QuickInstallMarketPackage {
  title?: string;
  description?: string;
  language?: string;
  gameType?: string;
  category?: string;
  platform?: string;
  runtime?: string;
  author?: string;
  setupInfo?: Record<string, unknown>;
}

interface QuickInstallMarket {
  languages?: unknown[];
  packages?: QuickInstallMarketPackage[];
}

class PanelClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.panelBaseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        "x-request-api-key": config.panelApiKey
      },
      // Always resolve; we inspect the envelope ourselves.
      validateStatus: () => true
    });
  }

  private async call<T>(method: Method, url: string, body?: unknown): Promise<T> {
    try {
      const res = await this.http.request<PanelEnvelope<T>>({
        method,
        url,
        data: body
      });
      const envelope = res.data;
      if (!envelope || typeof envelope.status !== "number") {
        throw new Error(`Unparseable panel response: ${JSON.stringify(res.data).slice(0, 200)}`);
      }
      if (envelope.status !== 200) {
        throw new Error(String(envelope.data ?? "Panel request failed"));
      }
      return envelope.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Panel call ${method} ${url} failed: ${message}`);
      throw upstream(message);
    }
  }

  /** Create a normal (permission=1) panel user. Returns false if the name exists. */
  async createUser(username: string, password: string): Promise<{ uuid: string; userName: string }> {
    try {
      return await this.call("POST", "/api/auth", {
        username,
        password,
        permission: 1
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/exist|already|重复|已存在/i.test(msg)) {
        throw upstream("Username already exists", "USER_EXISTS");
      }
      throw err;
    }
  }

  /** Verify buyer credentials against the panel. Throws on failure. */
  async verifyLogin(username: string, password: string): Promise<void> {
    await this.call("POST", "/api/auth/login", { username, password, code: "" });
  }

  /** Find a panel user's UUID by username (admin apiKey). Returns "" if absent. */
  async getUserUuid(username: string): Promise<string> {
    const res = await this.call<unknown>(
      "GET",
      `/api/auth?userName=${encodeURIComponent(username)}`
    );
    type Row = { uuid?: string; userName?: string };
    const list: Row[] = Array.isArray(res)
      ? (res as Row[])
      : Array.isArray((res as { data?: unknown[] })?.data)
      ? ((res as { data: Row[] }).data)
      : [];
    const found = list.find((u) => u && u.userName === username);
    return found?.uuid ?? "";
  }

  /** Reset a user's password as admin (requires the panel user uuid). */
  async updateUserPassword(uuid: string, password: string): Promise<void> {
    await this.call("PUT", `/api/auth?uuid=${encodeURIComponent(uuid)}`, { password });
  }

  listNodes(): Promise<PanelNode[]> {
    return this.call("GET", "/api/service/remote_services_list");
  }

  private exchange<T>(action: string, data: Record<string, unknown>): Promise<T> {
    return this.call("POST", "/api/exchange/", { request_action: action, data });
  }

  pingNode(nodeId: string): Promise<NodeStatus> {
    return this.exchange<NodeStatus>("ping", { node_id: nodeId });
  }

  buy(params: BuyParams): Promise<BuyResult> {
    return this.exchange<BuyResult>("buy", params as unknown as Record<string, unknown>);
  }

  renew(params: RenewParams): Promise<{ instance_id: string; expire: number }> {
    return this.exchange("renew", {
      category_id: params.category_id,
      node_id: params.node_id,
      instance_id: params.instance_id,
      hours: params.hours
    });
  }

  queryInstances(username: string, nodeId?: string): Promise<InstanceInfo[]> {
    return this.exchange<InstanceInfo[]>("query_instance", {
      username,
      ...(nodeId ? { node_id: nodeId } : {})
    });
  }

  ssoToken(username: string): Promise<string> {
    return this.exchange<string>("sso_token", { username });
  }

  /**
   * Official quick-start market templates, used to prefill a package setupInfo.
   * The panel returns { languages, packages } (or [] on failure); we unwrap
   * packages and only keep entries that carry a usable setupInfo object.
   */
  async quickInstallList(): Promise<QuickStartTemplate[]> {
    const market = await this.call<QuickInstallMarket | unknown[]>(
      "GET",
      "/api/instance/quick_install_list"
    );
    const raw = Array.isArray(market) ? [] : market?.packages ?? [];
    return raw
      .filter((p) => p && typeof p.setupInfo === "object" && p.setupInfo !== null)
      .map((p) => ({
        title: p.title || "Untitled",
        description: p.description || "",
        language: p.language || "",
        gameType: p.gameType || "",
        category: p.category || "",
        platform: p.platform || "",
        runtime: p.runtime || "",
        author: p.author || "",
        setupInfo: p.setupInfo as Record<string, unknown>
      }));
  }

  /**
   * Start / stop / restart an instance. The panel operates on query params
   * (uuid + daemonId) and accepts GET; the daemon runs the action
   * asynchronously, so the response body is intentionally ignored.
   */
  async instanceAction(
    action: "open" | "stop" | "restart",
    instanceUuid: string,
    daemonId: string
  ): Promise<void> {
    const qs = new URLSearchParams({ uuid: instanceUuid, daemonId });
    await this.call("GET", `/api/protected_instance/${action}?${qs.toString()}`);
  }

  /** Build a one-click login URL that redirects the buyer into the MCSM UI terminal. */
  buildSsoUrl(params: { username: string; token: string; instanceId: string; daemonId: string }): string {
    const origin = config.mcsmUiOrigin;
    const qs = new URLSearchParams({
      username: params.username,
      token: params.token,
      instanceId: params.instanceId,
      daemonId: params.daemonId,
      origin
    });
    // The browser follows this link; it must use the user-facing panel origin.
    return `${config.mcsmUiOrigin}/api/exchange/sso?${qs.toString()}`;
  }
}

export const panelClient = new PanelClient();
