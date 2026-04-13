/**
 * JIRA Cloud REST API v3 client (minimal — only what we need).
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 */

export interface CreateIssueInput {
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  labels?: string[];
  priority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
}

export class JiraClient {
  private readonly baseHeaders: Record<string, string>;

  constructor(
    private readonly baseUrl: string,
    email: string,
    apiToken: string,
  ) {
    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
    this.baseHeaders = {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Create an issue and return its key (e.g. "PLSQL-123").
   */
  async createIssue(input: CreateIssueInput): Promise<string> {
    const body = {
      fields: {
        project:   { key: input.projectKey },
        issuetype: { name: input.issueType },
        summary:   input.summary,
        description: this._toAdf(input.description),
        ...(input.labels?.length ? { labels: input.labels } : {}),
        ...(input.priority ? { priority: { name: input.priority } } : {}),
      },
    };

    const url = `${this.baseUrl}/rest/api/3/issue`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.baseHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`JIRA API error ${response.status}: ${text}`);
    }

    const data = await response.json() as { key: string };
    return data.key;
  }

  /**
   * Convert markdown-like description to Atlassian Document Format (ADF).
   * ADF is required by JIRA Cloud REST API v3.
   */
  private _toAdf(markdown: string): object {
    const lines = markdown.split('\n');
    const content: object[] = [];

    for (const line of lines) {
      if (line.startsWith('---')) {
        content.push({ type: 'rule' });
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold line (treat as heading in ADF)
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: line.replace(/\*\*/g, ''), marks: [{ type: 'strong' }] }],
        });
      } else if (line.trim() === '') {
        // Skip blank lines (they're paragraph separators; don't add empty paragraphs)
      } else {
        // Regular bold-label: **Label:** Value
        const boldMatch = /^\*\*(.+?):\*\* (.+)/.exec(line);
        if (boldMatch) {
          content.push({
            type: 'paragraph',
            content: [
              { type: 'text', text: `${boldMatch[1]}: `, marks: [{ type: 'strong' }] },
              { type: 'text', text: boldMatch[2] },
            ],
          });
        } else {
          content.push({
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
          });
        }
      }
    }

    return {
      type: 'doc',
      version: 1,
      content: content.length > 0 ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    };
  }
}
