/**
 * Issue Tracker integration — creates JIRA or Linear tickets from findings.
 *
 * Configuration (VS Code settings):
 *   plsqlAnalyzer.jira.baseUrl     e.g. "https://mycompany.atlassian.net"
 *   plsqlAnalyzer.jira.projectKey  e.g. "PLSQL"
 *   plsqlAnalyzer.jira.issueType   e.g. "Technical Debt"
 *   plsqlAnalyzer.linear.teamId    Linear team UUID
 *   plsqlAnalyzer.linear.labelId   Label UUID to apply to issues
 *
 * Credentials (VS Code Secret Storage — never in settings.json):
 *   plsqlAnalyzer.jira.apiToken    Atlassian API token
 *   plsqlAnalyzer.jira.email       Atlassian account email
 *   plsqlAnalyzer.linear.apiKey    Linear API key
 */

import * as vscode from 'vscode';
import { JiraClient } from './jira-client.js';
import type { Finding } from '@plsql-analyzer/shared';
import type { AnalyzedObject } from '../analysis/analysis-engine.js';
import { logger } from '../util/logger.js';

export type IssueTrackerType = 'jira' | 'linear' | 'none';

// ---------------------------------------------------------------------------
// Main entry: create ticket from a finding
// ---------------------------------------------------------------------------

export async function createTicketFromFinding(
  finding: Finding,
  object: AnalyzedObject,
  secrets: vscode.SecretStorage,
): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('plsqlAnalyzer');
  const tracker = detectTracker(cfg);

  if (tracker === 'none') {
    void vscode.window.showWarningMessage(
      'No issue tracker configured. Set plsqlAnalyzer.jira.baseUrl or plsqlAnalyzer.linear.teamId in settings.',
      'Open Settings',
    ).then(action => {
      if (action) void vscode.commands.executeCommand('workbench.action.openSettings', 'plsqlAnalyzer');
    });
    return;
  }

  if (tracker === 'jira') {
    await createJiraTicket(finding, object, cfg, secrets);
  } else {
    await createLinearTicket(finding, object, cfg, secrets);
  }
}

// ---------------------------------------------------------------------------
// JIRA
// ---------------------------------------------------------------------------

async function createJiraTicket(
  finding: Finding,
  object: AnalyzedObject,
  cfg: vscode.WorkspaceConfiguration,
  secrets: vscode.SecretStorage,
): Promise<void> {
  const baseUrl    = cfg.get<string>('jira.baseUrl', '');
  const projectKey = cfg.get<string>('jira.projectKey', 'PLSQL');
  const issueType  = cfg.get<string>('jira.issueType', 'Task');

  if (!baseUrl) {
    void vscode.window.showErrorMessage('plsqlAnalyzer.jira.baseUrl is not set.');
    return;
  }

  const [email, token] = await Promise.all([
    secrets.get('plsqlAnalyzer.jira.email'),
    secrets.get('plsqlAnalyzer.jira.apiToken'),
  ]);

  if (!email || !token) {
    const action = await vscode.window.showErrorMessage(
      'JIRA credentials not stored. Run "PL/SQL: Configure JIRA Credentials" first.',
      'Configure',
    );
    if (action === 'Configure') {
      await vscode.commands.executeCommand('plsql-analyzer.configureJira');
    }
    return;
  }

  const client = new JiraClient(baseUrl, email, token);
  const { summary, description } = buildIssueContent(finding, object);

  try {
    const key = await client.createIssue({
      projectKey,
      issueType,
      summary,
      description,
      labels: ['plsql-analyzer', finding.category.toLowerCase()],
      priority: finding.severity === 'ERROR' ? 'High' : finding.severity === 'WARNING' ? 'Medium' : 'Low',
    });

    const url = `${baseUrl}/browse/${key}`;
    logger.info(`JIRA issue created: ${key}`);

    const action = await vscode.window.showInformationMessage(
      `Created ${key}: ${summary}`,
      'Open in Browser',
    );
    if (action === 'Open in Browser') {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  } catch (err) {
    logger.error('JIRA issue creation failed', err);
    void vscode.window.showErrorMessage(`Failed to create JIRA issue: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Linear (GraphQL API)
// ---------------------------------------------------------------------------

async function createLinearTicket(
  finding: Finding,
  object: AnalyzedObject,
  cfg: vscode.WorkspaceConfiguration,
  secrets: vscode.SecretStorage,
): Promise<void> {
  const teamId  = cfg.get<string>('linear.teamId', '');
  const labelId = cfg.get<string>('linear.labelId', '');

  if (!teamId) {
    void vscode.window.showErrorMessage('plsqlAnalyzer.linear.teamId is not set.');
    return;
  }

  const apiKey = await secrets.get('plsqlAnalyzer.linear.apiKey');
  if (!apiKey) {
    const action = await vscode.window.showErrorMessage(
      'Linear API key not stored. Run "PL/SQL: Configure Linear Credentials" first.',
      'Configure',
    );
    if (action === 'Configure') {
      await vscode.commands.executeCommand('plsql-analyzer.configureLinear');
    }
    return;
  }

  const { summary, description } = buildIssueContent(finding, object);

  try {
    const result = await linearCreateIssue({
      apiKey,
      teamId,
      labelId: labelId || undefined,
      title: summary,
      description,
      priority: finding.severity === 'ERROR' ? 1 : finding.severity === 'WARNING' ? 2 : 3,
    });

    logger.info(`Linear issue created: ${result.identifier}`);

    const action = await vscode.window.showInformationMessage(
      `Created ${result.identifier}: ${summary}`,
      'Open in Browser',
    );
    if (action === 'Open in Browser') {
      await vscode.env.openExternal(vscode.Uri.parse(result.url));
    }
  } catch (err) {
    logger.error('Linear issue creation failed', err);
    void vscode.window.showErrorMessage(`Failed to create Linear issue: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Shared content builder
// ---------------------------------------------------------------------------

function buildIssueContent(
  finding: Finding,
  object: AnalyzedObject,
): { summary: string; description: string } {
  const objectName = `${object.object.schema}.${object.object.name} (${object.object.type})`;

  const summary = `[${finding.ruleId}] ${object.object.name}: ${finding.message.slice(0, 100)}`;

  const description = [
    `**Object:** ${objectName}`,
    `**Rule:** ${finding.ruleId} (${finding.category})`,
    `**Severity:** ${finding.severity}`,
    `**Line:** ${finding.location.line}`,
    finding.cweId ? `**CWE:** ${finding.cweId}` : '',
    '',
    `**Finding:** ${finding.message}`,
    '',
    finding.suggestion ? `**Suggestion:** ${finding.suggestion}` : '',
    '',
    finding.effortMinutes
      ? `**Estimated effort:** ${finding.effortMinutes} minutes`
      : '',
    '',
    `---`,
    `_Created by PL/SQL Analyzer VS Code Extension_`,
  ].filter(l => l !== undefined).join('\n');

  return { summary, description };
}

// ---------------------------------------------------------------------------
// Linear GraphQL helper (no external SDK dependency)
// ---------------------------------------------------------------------------

interface LinearIssueResult {
  identifier: string;
  url: string;
}

async function linearCreateIssue(opts: {
  apiKey: string;
  teamId: string;
  labelId?: string;
  title: string;
  description: string;
  priority: number;
}): Promise<LinearIssueResult> {
  const mutation = `
    mutation CreateIssue($teamId: String!, $title: String!, $description: String, $priority: Int, $labelIds: [String!]) {
      issueCreate(input: {
        teamId: $teamId
        title: $title
        description: $description
        priority: $priority
        labelIds: $labelIds
      }) {
        success
        issue { identifier url }
      }
    }
  `;

  const variables = {
    teamId: opts.teamId,
    title: opts.title,
    description: opts.description,
    priority: opts.priority,
    labelIds: opts.labelId ? [opts.labelId] : [],
  };

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Authorization': opts.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as {
    data?: { issueCreate?: { success: boolean; issue?: { identifier: string; url: string } } };
    errors?: Array<{ message: string }>;
  };

  if (data.errors?.length) {
    throw new Error(data.errors.map(e => e.message).join('; '));
  }

  const issue = data.data?.issueCreate?.issue;
  if (!issue) throw new Error('Linear API returned no issue data');

  return issue;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function detectTracker(cfg: vscode.WorkspaceConfiguration): IssueTrackerType {
  if (cfg.get<string>('jira.baseUrl')) return 'jira';
  if (cfg.get<string>('linear.teamId')) return 'linear';
  return 'none';
}
