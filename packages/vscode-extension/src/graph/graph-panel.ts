/**
 * GraphPanel — VS Code WebviewPanel for the Cytoscape.js dependency graph.
 *
 * Singleton: calling open() when the panel is already visible just reveals it.
 * The caller supplies CyElement[] built by dependency-graph.ts; the panel
 * posts a loadGraph message to the webview.
 *
 * Inbound messages from webview:
 *   nodeSelected  → fires onNodeSelected callback
 *   navigateTo    → opens the object source via plsql-analyzer.analyzeObject
 *   exportSvg     → prompts save dialog and writes the SVG file
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { CyElement } from './dependency-graph.js';
import { logger } from '../util/logger.js';

type NodeSelectedCallback = (objectId: string) => void;

export class GraphPanel implements vscode.Disposable {
  private static _instance: GraphPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _onNodeSelected: NodeSelectedCallback | undefined;

  private constructor(
    private readonly _extensionUri: vscode.Uri,
  ) {
    this._panel = vscode.window.createWebviewPanel(
      'plsqlDependencyGraph',
      'PL/SQL Dependency Graph',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(_extensionUri, 'resources'),
          vscode.Uri.joinPath(_extensionUri, 'src', 'graph', 'webview'),
          vscode.Uri.joinPath(_extensionUri, 'dist'),
        ],
        retainContextWhenHidden: true,
      },
    );

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  static open(extensionUri: vscode.Uri): GraphPanel {
    if (GraphPanel._instance) {
      GraphPanel._instance._panel.reveal(vscode.ViewColumn.Beside);
      return GraphPanel._instance;
    }
    GraphPanel._instance = new GraphPanel(extensionUri);
    GraphPanel._instance._panel.webview.html =
      GraphPanel._instance._buildHtml();
    return GraphPanel._instance;
  }

  onNodeSelected(cb: NodeSelectedCallback): void {
    this._onNodeSelected = cb;
  }

  loadGraph(elements: CyElement[], title?: string): void {
    if (title) {
      this._panel.title = `Dependency Graph — ${title}`;
    }
    void this._panel.webview.postMessage({ type: 'loadGraph', elements });
  }

  focusNode(objectId: string): void {
    void this._panel.webview.postMessage({ type: 'focusNode', objectId });
  }

  reveal(): void {
    this._panel.reveal(vscode.ViewColumn.Beside);
  }

  dispose(): void {
    this._dispose();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _buildHtml(): string {
    const webview = this._panel.webview;

    // Serve cytoscape.min.js from resources/ (must be copied there at build time)
    const cytoscapeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'resources', 'cytoscape.min.js'),
    );

    // Read the HTML template.
    // Production: dist/webview/graph-webview.html (copied by esbuild.mjs)
    // Development: src/graph/webview/graph-webview.html (F5 launch from source)
    const candidates = [
      path.join(this._extensionUri.fsPath, 'dist', 'webview', 'graph-webview.html'),
      path.join(this._extensionUri.fsPath, 'src', 'graph', 'webview', 'graph-webview.html'),
    ];

    let html = FALLBACK_HTML;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        html = fs.readFileSync(p, 'utf-8');
        break;
      }
    }

    return html
      .replace(/\$\{cspSource\}/g, webview.cspSource)
      .replace(/\$\{cytoscapeUri\}/g, cytoscapeUri.toString());
  }

  private _handleMessage(msg: WebviewMessage): void {
    switch (msg.type) {
      case 'nodeSelected':
        this._onNodeSelected?.(msg.objectId);
        break;

      case 'navigateTo':
        // Fire the analyzeObject command so the object source opens in the editor
        void vscode.commands.executeCommand(
          'plsql-analyzer.analyzeObject',
          undefined, undefined,
          msg.objectId.split('.')[1]?.split(':')[0],
          msg.objectId.split(':')[1],
        );
        break;

      case 'exportSvg':
        void this._saveSvg(msg.svg);
        break;

      default:
        logger.warn('GraphPanel: unknown message type', (msg as Record<string, unknown>).type);
    }
  }

  private async _saveSvg(svgContent: string): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      filters: { 'SVG Image': ['svg'] },
      defaultUri: vscode.Uri.file('dependency-graph.svg'),
    });
    if (!uri) return;
    try {
      fs.writeFileSync(uri.fsPath, svgContent, 'utf-8');
      void vscode.window.showInformationMessage(`Graph exported to ${path.basename(uri.fsPath)}`);
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to save SVG: ${String(err)}`);
    }
  }

  private _dispose(): void {
    GraphPanel._instance = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
  }
}

// ---------------------------------------------------------------------------
// Message types (webview → extension)
// ---------------------------------------------------------------------------

interface NodeSelectedMsg { type: 'nodeSelected'; objectId: string }
interface NavigateToMsg   { type: 'navigateTo';   objectId: string }
interface ExportSvgMsg    { type: 'exportSvg';    svg: string }
type WebviewMessage = NodeSelectedMsg | NavigateToMsg | ExportSvgMsg;

// ---------------------------------------------------------------------------
// Fallback HTML shown when the template file can't be found
// ---------------------------------------------------------------------------

const FALLBACK_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{background:#1e1e1e;color:#d4d4d4;font-family:sans-serif;padding:2rem;}</style>
</head><body>
<h2>Dependency Graph</h2>
<p style="color:#f48771">Error: graph-webview.html template not found.<br>
Run the build first: <code>npm run build</code></p>
</body></html>`;
