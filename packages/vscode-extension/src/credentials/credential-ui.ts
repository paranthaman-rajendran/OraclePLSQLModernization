/**
 * QuickInput prompts for collecting Oracle connection credentials.
 * Password input uses `password: true` — VS Code masks the input.
 * Passwords are never stored in local variables beyond the scope of collection.
 */

import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import type { StoredConnectionMeta } from './secret-storage.js';

export interface CollectedCredentials {
  readonly meta: StoredConnectionMeta;
  /** Returned once so caller can pass to SecretStorage — not retained */
  readonly password: string;
}

export async function promptForConnection(): Promise<CollectedCredentials | undefined> {
  const label = await vscode.window.showInputBox({
    title: 'New Oracle Connection (1/6)',
    prompt: 'Enter a label for this connection',
    placeHolder: 'e.g. Production Read-Only',
    validateInput: v => (!v ? 'Label is required' : undefined),
  });
  if (!label) return undefined;

  const host = await vscode.window.showInputBox({
    title: 'New Oracle Connection (2/6)',
    prompt: 'Oracle host',
    placeHolder: 'e.g. db.example.com or 10.0.0.1',
    validateInput: v => (!v ? 'Host is required' : undefined),
  });
  if (!host) return undefined;

  const portStr = await vscode.window.showInputBox({
    title: 'New Oracle Connection (3/6)',
    prompt: 'Oracle port',
    value: '1521',
    validateInput: v => {
      const n = parseInt(v, 10);
      return isNaN(n) || n < 1 || n > 65535 ? 'Enter a valid port number (1–65535)' : undefined;
    },
  });
  if (!portStr) return undefined;

  const serviceName = await vscode.window.showInputBox({
    title: 'New Oracle Connection (4/6)',
    prompt: 'Service name or SID',
    placeHolder: 'e.g. ORCL or XEPDB1',
    validateInput: v => (!v ? 'Service name is required' : undefined),
  });
  if (!serviceName) return undefined;

  const username = await vscode.window.showInputBox({
    title: 'New Oracle Connection (5/6)',
    prompt: 'Database username',
    placeHolder: 'e.g. hr_readonly',
    validateInput: v => (!v ? 'Username is required' : undefined),
  });
  if (!username) return undefined;

  const password = await vscode.window.showInputBox({
    title: 'New Oracle Connection (6/6)',
    prompt: 'Database password',
    password: true,  // VS Code masks input — never shown in UI or logs
    validateInput: v => (!v ? 'Password is required' : undefined),
  });
  if (password === undefined) return undefined;

  const id = uuidv4();
  const meta: StoredConnectionMeta = {
    id,
    label,
    host,
    port: parseInt(portStr, 10),
    serviceName,
    username,
  };

  return { meta, password };
}
