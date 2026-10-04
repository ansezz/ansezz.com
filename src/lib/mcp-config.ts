/**
 * MCP client config generator and validator. Pure functions, no DOM.
 *
 * Formats checked against each client's official docs on 4 October 2026:
 *   - Claude Desktop: modelcontextprotocol.io/docs/develop/connect-local-servers
 *     claude_desktop_config.json, top-level "mcpServers", local stdio servers
 *     with command, args, env. Remote servers are added as connectors in the
 *     app, not in this file.
 *   - Claude Code: code.claude.com/docs/en/mcp
 *     .mcp.json (project) with "mcpServers". stdio: command, args, env.
 *     Remote: "type": "http" (or "sse", "ws"), url, headers. A url with no
 *     type is an error. ${VAR} and ${VAR:-default} expansion. Server names:
 *     letters, numbers, hyphens, underscores.
 *   - Cursor: cursor.com/docs/context/mcp
 *     .cursor/mcp.json or ~/.cursor/mcp.json with "mcpServers". stdio:
 *     type "stdio", command, args, env, envFile. Remote: url, headers.
 *     Interpolation uses ${env:NAME}.
 *   - VS Code: code.visualstudio.com/docs/copilot/reference/mcp-configuration
 *     .vscode/mcp.json with top-level "servers" (and optional "inputs").
 *     stdio: type "stdio", command, args, env, envFile, cwd. Remote:
 *     type "http" or "sse", url, headers. The portable .mcp.json format
 *     with "mcpServers" is also read.
 */

export type McpClient = "claude-desktop" | "claude-code" | "cursor" | "vscode";
export type McpTransport = "stdio" | "http";

export interface ClientInfo {
  id: McpClient;
  label: string;
  /** Where the file lives, plain text. */
  file: string;
  /** Top-level key that holds the servers. */
  rootKey: "mcpServers" | "servers";
  /** Whether remote (URL) servers can go in this file. */
  remoteInFile: boolean;
  /** How to reference an environment variable, for hints. */
  envSyntax: string | null;
  docs: string;
}

export const MCP_CLIENTS: Record<McpClient, ClientInfo> = {
  "claude-desktop": {
    id: "claude-desktop",
    label: "Claude Desktop",
    file: "macOS: ~/Library/Application Support/Claude/claude_desktop_config.json. Windows: %APPDATA%\\Claude\\claude_desktop_config.json",
    rootKey: "mcpServers",
    remoteInFile: false,
    envSyntax: null,
    docs: "https://modelcontextprotocol.io/docs/develop/connect-local-servers",
  },
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    file: ".mcp.json in your project root (shared with the team)",
    rootKey: "mcpServers",
    remoteInFile: true,
    envSyntax: "${VAR}",
    docs: "https://code.claude.com/docs/en/mcp",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    file: ".cursor/mcp.json in your project, or ~/.cursor/mcp.json for all projects",
    rootKey: "mcpServers",
    remoteInFile: true,
    envSyntax: "${env:VAR}",
    docs: "https://cursor.com/docs/context/mcp",
  },
  vscode: {
    id: "vscode",
    label: "VS Code",
    file: ".vscode/mcp.json in your workspace",
    rootKey: "servers",
    remoteInFile: true,
    envSyntax: "${input:id} or ${env:VAR}",
    docs: "https://code.visualstudio.com/docs/copilot/reference/mcp-configuration",
  },
};

export interface ServerSpec {
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  headers: Record<string, string>;
}

/** Splits text into non-empty trimmed lines. */
export function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Parses "KEY=value" lines (env) or "Name: value" lines (headers). */
export function parsePairs(
  text: string,
  sep: "=" | ":",
): { pairs: Record<string, string>; bad: string[] } {
  const pairs: Record<string, string> = {};
  const bad: string[] = [];
  for (const l of lines(text)) {
    const i = l.indexOf(sep);
    if (i <= 0) {
      bad.push(l);
      continue;
    }
    pairs[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return { pairs, bad };
}

export interface GenerateResult {
  /** JSON text for the client's config file, or null if not supported. */
  json: string | null;
  /** Claude Code CLI command, when the client is Claude Code. */
  cli: string | null;
  notes: string[];
}

/** Quotes a value for a POSIX shell when it needs it. */
export function shellQuote(s: string): string {
  if (s === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function generateConfig(
  client: McpClient,
  s: ServerSpec,
): GenerateResult {
  const info = MCP_CLIENTS[client];
  const notes: string[] = [];
  const name = s.name.trim() || "my-server";
  let entry: Record<string, unknown>;

  if (s.transport === "stdio") {
    entry = {};
    if (client === "cursor" || client === "vscode") entry.type = "stdio";
    entry.command = s.command.trim();
    if (s.args.length) entry.args = s.args;
    if (Object.keys(s.env).length) entry.env = s.env;
    if (!s.command.trim())
      notes.push(
        "Add the command that starts the server, for example npx or node.",
      );
  } else {
    if (!info.remoteInFile) {
      return {
        json: null,
        cli: null,
        notes: [
          "Claude Desktop does not read remote servers from claude_desktop_config.json. Add a remote server as a custom connector in the app settings instead.",
        ],
      };
    }
    entry = {};
    if (client !== "cursor") entry.type = "http";
    entry.url = s.url.trim();
    if (Object.keys(s.headers).length) entry.headers = s.headers;
    if (!s.url.trim())
      notes.push("Add the server URL, for example https://example.com/mcp.");
  }

  const json = JSON.stringify({ [info.rootKey]: { [name]: entry } }, null, 2);

  let cli: string | null = null;
  if (client === "claude-code") {
    if (s.transport === "stdio") {
      const env = Object.entries(s.env)
        .map(([k, v]) => `--env ${shellQuote(`${k}=${v}`)}`)
        .join(" ");
      cli = [
        "claude mcp add",
        env,
        "--transport stdio",
        shellQuote(name),
        "--",
        shellQuote(s.command.trim() || "npx"),
        ...s.args.map(shellQuote),
      ]
        .filter(Boolean)
        .join(" ");
    } else {
      const headers = Object.entries(s.headers)
        .map(([k, v]) => `--header ${shellQuote(`${k}: ${v}`)}`)
        .join(" ");
      cli = [
        "claude mcp add --transport http",
        shellQuote(name),
        shellQuote(s.url.trim()),
        headers,
      ]
        .filter(Boolean)
        .join(" ");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(name))
      notes.push(
        "Claude Code server names may only use letters, numbers, hyphens and underscores.",
      );
  }

  const secretish = [...Object.values(s.env), ...Object.values(s.headers)].some(
    looksLikeSecret,
  );
  if (secretish && info.envSyntax)
    notes.push(
      `A value looks like a real secret. If you commit this file, reference an environment variable instead with ${info.envSyntax}.`,
    );
  if (
    s.transport === "stdio" &&
    s.command.trim() === "npx" &&
    !s.args.includes("-y") &&
    !s.args.includes("--yes")
  )
    notes.push(
      'Add "-y" as the first arg so npx does not stop to ask before installing the package.',
    );

  return { json, cli, notes };
}

/** True for values that look like a pasted API key or token. */
export function looksLikeSecret(v: string): boolean {
  const t = v.replace(/^Bearer\s+/i, "").trim();
  if (/\$\{[^}]+\}/.test(t)) return false; // already a reference
  if (
    /^(sk-|sk_|pk_|ghp_|gho_|github_pat_|xox[abp]-|shpat_|shpss_|AKIA)/.test(t)
  )
    return true;
  return (
    t.length >= 24 &&
    /[A-Za-z]/.test(t) &&
    /\d/.test(t) &&
    !/\s/.test(t) &&
    !/^https?:/.test(t)
  );
}

// ── Validator ─────────────────────────────────────────────────────────

export interface Issue {
  level: "error" | "warning";
  /** JSON path like mcpServers.github.url, or "" for the whole file. */
  path: string;
  message: string;
}

/** Turns a JSON.parse error into a message with line and column. */
export function jsonErrorLocation(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lc = /line (\d+) column (\d+)/.exec(msg);
  if (lc)
    return `Invalid JSON at line ${lc[1]}, column ${lc[2]}. ${hintFor(text, msg)}`.trim();
  const pos = /position (\d+)/.exec(msg);
  if (pos) {
    const p = Number(pos[1]);
    const before = text.slice(0, p);
    const line = before.split("\n").length;
    const col = p - before.lastIndexOf("\n");
    return `Invalid JSON at line ${line}, column ${col}. ${hintFor(text, msg)}`.trim();
  }
  return `Invalid JSON. ${hintFor(text, msg)}`.trim();
}

function hintFor(text: string, msg: string): string {
  if (/,\s*[}\]]/.test(text))
    return "There is a trailing comma before a closing bracket. JSON does not allow it.";
  if (/^\s*\/\//m.test(text))
    return "JSON does not allow // comments. Remove them.";
  if (/'[^']*'\s*:/.test(text))
    return "Use double quotes for keys and strings, not single quotes.";
  if (/Unexpected end/i.test(msg))
    return "The file ends early. Check for a missing } or ].";
  return "";
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validateConfig(text: string, client: McpClient): Issue[] {
  const info = MCP_CLIENTS[client];
  const issues: Issue[] = [];
  const err = (path: string, message: string) =>
    issues.push({ level: "error", path, message });
  const warn = (path: string, message: string) =>
    issues.push({ level: "warning", path, message });

  if (!text.trim())
    return [
      { level: "error", path: "", message: "Paste a config file to check." },
    ];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return [{ level: "error", path: "", message: jsonErrorLocation(text, e) }];
  }
  if (!isObj(data)) {
    err("", "The file must be a JSON object, starting with {.");
    return issues;
  }

  const want = info.rootKey;
  const other = want === "mcpServers" ? "servers" : "mcpServers";
  let servers: unknown = data[want];
  let root: string = want;
  if (servers === undefined) {
    if (data[other] !== undefined) {
      if (client === "vscode") {
        err(
          other,
          `.vscode/mcp.json uses "servers", not "mcpServers". The "mcpServers" key belongs in a root .mcp.json file.`,
        );
      } else {
        err(
          other,
          `${info.label} expects "mcpServers" at the top level, not "servers". "servers" is the VS Code format.`,
        );
      }
      servers = data[other];
      root = other;
    } else if (["command", "url", "args"].some((k) => k in data)) {
      err(
        "",
        `This looks like a single server entry. Wrap it: { "${want}": { "my-server": { ... } } }.`,
      );
      return issues;
    } else {
      err("", `Missing the top-level "${want}" object.`);
      return issues;
    }
  }
  if (!isObj(servers)) {
    err(
      root,
      `"${root}" must be an object that maps server names to settings.`,
    );
    return issues;
  }
  const names = Object.keys(servers);
  if (names.length === 0) warn(root, "No servers are defined yet.");

  for (const name of names) {
    const p = `${root}.${name}`;
    const s = servers[name];
    if (!isObj(s)) {
      err(p, "Each server must be an object.");
      continue;
    }
    if (client === "claude-code" && !/^[A-Za-z0-9_-]+$/.test(name))
      err(
        p,
        "Claude Code server names may only use letters, numbers, hyphens and underscores.",
      );

    const type = s.type;
    const hasUrl = "url" in s || "serverUrl" in s;
    const hasCmd = "command" in s;
    if (type !== undefined && typeof type !== "string")
      err(`${p}.type`, '"type" must be a string.');
    const okTypes: Record<McpClient, string[]> = {
      "claude-desktop": ["stdio"],
      "claude-code": ["stdio", "http", "streamable-http", "sse", "ws"],
      cursor: ["stdio", "http", "sse"],
      vscode: ["stdio", "http", "sse"],
    };
    if (typeof type === "string" && !okTypes[client].includes(type))
      err(
        `${p}.type`,
        `"${type}" is not a type ${info.label} accepts here. Use one of: ${okTypes[client].join(", ")}.`,
      );

    if (hasUrl && hasCmd)
      err(
        p,
        'Use either "command" (local server) or "url" (remote server), not both.',
      );
    if (!hasUrl && !hasCmd) {
      err(
        p,
        'Missing "command" for a local server or "url" for a remote server.',
      );
      continue;
    }

    if ("serverUrl" in s && !("url" in s))
      err(`${p}.serverUrl`, `${info.label} reads "url", not "serverUrl".`);

    if (hasUrl) {
      if (!info.remoteInFile) {
        err(
          p,
          "Claude Desktop does not load remote servers from this file. Add it as a custom connector in the app settings.",
        );
      }
      if (client === "claude-code" && type === undefined)
        err(
          p,
          'A server with a "url" needs "type": "http" (or "sse" / "ws") in Claude Code. Without it, Claude Code reports the server as invalid.',
        );
      if (client === "vscode" && type === undefined)
        err(p, 'VS Code needs "type": "http" (or "sse") on a remote server.');
      if (typeof type === "string" && type === "stdio")
        err(`${p}.type`, 'A server with a "url" cannot be "type": "stdio".');
      const url = s.url;
      if (typeof url !== "string") err(`${p}.url`, '"url" must be a string.');
      else if (
        !/^(https?|wss?):\/\//.test(url) &&
        !/^\$\{/.test(url) &&
        !(client === "vscode" && /^(unix|pipe):\/\//.test(url))
      )
        err(
          `${p}.url`,
          `"${url}" is not a full URL. Start it with https:// (or http:// for localhost).`,
        );
      else if (
        /^http:\/\//.test(url) &&
        !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url)
      )
        warn(
          `${p}.url`,
          "Plain http:// to a remote host sends your headers unencrypted. Use https://.",
        );
      if ("headers" in s)
        checkStringMap(s.headers, `${p}.headers`, err, warn, client);
      if ("env" in s && client !== "claude-code")
        warn(
          `${p}.env`,
          '"env" only applies to local servers. Remote servers ignore it.',
        );
      if ("envFile" in s)
        warn(`${p}.envFile`, '"envFile" only works for local stdio servers.');
    }

    if (hasCmd) {
      if (client === "vscode" && type === undefined)
        warn(
          p,
          'VS Code documents "type": "stdio" as required. Add it to be safe.',
        );
      if (client === "cursor" && type === undefined)
        warn(
          p,
          'Cursor documents "type": "stdio" as required for local servers. Add it to be safe.',
        );
      const cmd = s.command;
      if (typeof cmd !== "string" || !cmd.trim())
        err(`${p}.command`, '"command" must be a non-empty string.');
      else {
        if (/\s/.test(cmd.trim()) && !/^[A-Za-z]:\\|^\//.test(cmd.trim()))
          err(
            `${p}.command`,
            `"command" has spaces. Put only the program in "command" and each argument in "args", for example "command": "npx", "args": ["-y", "pkg"].`,
          );
        const args = Array.isArray(s.args) ? s.args : [];
        if (
          cmd.trim() === "npx" &&
          !args.includes("-y") &&
          !args.includes("--yes")
        )
          warn(
            `${p}.args`,
            'npx without "-y" can stop and wait for an install prompt that you never see. Add "-y" as the first arg.',
          );
      }
      if ("args" in s) {
        if (!Array.isArray(s.args))
          err(
            `${p}.args`,
            '"args" must be an array of strings, like ["-y", "pkg"].',
          );
        else {
          s.args.forEach((a, i) => {
            if (typeof a !== "string")
              err(
                `${p}.args[${i}]`,
                "Each arg must be a string. Put numbers in quotes.",
              );
          });
          if (client === "claude-desktop")
            s.args.forEach((a, i) => {
              if (typeof a === "string" && /^(\.{1,2}\/|~\/)/.test(a))
                warn(
                  `${p}.args[${i}]`,
                  `"${a}" is a relative path. Claude Desktop needs absolute paths.`,
                );
            });
        }
      }
      if ("env" in s) checkStringMap(s.env, `${p}.env`, err, warn, client);
      if ("headers" in s)
        warn(`${p}.headers`, '"headers" only applies to remote servers.');
      if (
        typeof type === "string" &&
        ["http", "sse", "ws", "streamable-http"].includes(type)
      )
        err(`${p}.type`, `"type": "${type}" needs a "url", not a "command".`);
    }
  }
  return issues;
}

function checkStringMap(
  v: unknown,
  path: string,
  err: (p: string, m: string) => void,
  warn: (p: string, m: string) => void,
  client: McpClient,
): void {
  if (!isObj(v)) {
    err(path, "Must be an object of string values.");
    return;
  }
  for (const [k, val] of Object.entries(v)) {
    const p = `${path}.${k}`;
    if (
      typeof val !== "string" &&
      !(client === "vscode" && (typeof val === "number" || val === null))
    )
      err(p, "Values must be strings. Put numbers and booleans in quotes.");
    if (typeof val !== "string") continue;
    if (val !== val.trim())
      warn(
        p,
        "The value has leading or trailing spaces, often from a pasted token.",
      );
    if (looksLikeSecret(val))
      warn(
        p,
        "This looks like a real secret written into the file. Do not commit it. Use an environment variable reference instead.",
      );
    if (
      client === "cursor" &&
      /\$\{(?!env:|userHome|workspaceFolder|pathSeparator|\/)[A-Za-z_][A-Za-z0-9_]*\}/.test(
        val,
      )
    )
      warn(
        p,
        "Cursor reads environment variables as ${env:NAME}, not ${NAME}.",
      );
    if (client === "claude-code" && /\$\{env:/.test(val))
      warn(
        p,
        "Claude Code reads environment variables as ${NAME} or ${NAME:-default}, not ${env:NAME}.",
      );
    if (client === "claude-desktop" && /\$\{/.test(val))
      warn(
        p,
        "Claude Desktop's docs do not describe ${...} expansion. The value may be passed as plain text.",
      );
  }
}
