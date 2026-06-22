export interface McpHeaderConfig {
  name: string;
  value: string;
}

export interface McpServerConfig {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  authToken?: string;
  headers?: McpHeaderConfig[];
  allowedTools?: string[];
}

export interface McpServerPublicInfo {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  allowedTools?: string[];
  hasAuthToken: boolean;
  headers: Array<{ name: string; hasValue: boolean }>;
}

export interface McpToolInfo {
  name: string;
  title?: string;
  description?: string;
  readOnly?: boolean;
}
