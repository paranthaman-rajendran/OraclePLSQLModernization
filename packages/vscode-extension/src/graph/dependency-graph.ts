/**
 * Dependency graph data model.
 * Builds Cytoscape element descriptors from MCP dependency data + analysis metrics.
 */

import type { McpClient } from '../mcp/client.js';
import type { AnalyzedObject } from '../analysis/analysis-engine.js';
import { logger } from '../util/logger.js';

export interface CyNode {
  data: {
    id: string;
    label: string;
    objectId: string;
    type: string;
    color: string;
    cc: number;
    loc: number;
    fanIn: number;
    fanOut: number;
    findings: number;
    status: string;
  };
  classes?: string;
}

export interface CyEdge {
  data: {
    id: string;
    source: string;
    target: string;
    edgeType: string;
  };
  classes?: string;
}

export type CyElement = { group: 'nodes'; data: CyNode['data']; classes?: string }
                       | { group: 'edges'; data: CyEdge['data']; classes?: string };

const TYPE_COLOR: Record<string, string> = {
  'PACKAGE':      '#4ec9b0',
  'PACKAGE BODY': '#4ec9b0',
  'PROCEDURE':    '#dcdcaa',
  'FUNCTION':     '#c586c0',
  'TRIGGER':      '#f48771',
  'TYPE':         '#9cdcfe',
  'TYPE BODY':    '#9cdcfe',
  'VIEW':         '#ce9178',
};

function colorFor(type: string): string {
  return TYPE_COLOR[type] ?? '#888888';
}

/**
 * Build a complete schema-level dependency graph from analysis results
 * and MCP dependency edges.
 */
export async function buildSchemaGraph(
  connectionId: string,
  schema: string,
  analyzed: AnalyzedObject[],
  client: McpClient,
): Promise<CyElement[]> {
  const nodes: CyElement[] = analyzed.map(a => ({
    group: 'nodes' as const,
    data: {
      id: `${a.object.schema}.${a.object.name}:${a.object.type}`,
      label: a.object.name,
      objectId: a.object.id,
      type: a.object.type,
      color: colorFor(a.object.type),
      cc: a.metric.cyclomaticComplexity,
      loc: a.metric.linesOfCode,
      fanIn: a.metric.coupling.fanIn,
      fanOut: a.metric.coupling.fanOut,
      findings: a.findings.length,
      status: a.object.status,
    },
    classes: a.object.status !== 'VALID' ? 'invalid' : undefined,
  }));

  const nodeIds = new Set(nodes.map(n => n.data.id));
  const edges: CyElement[] = [];
  const seenEdges = new Set<string>();

  // Fetch dependency edges for all objects concurrently (capped)
  const CONCURRENCY = 8;
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < analyzed.length) {
      const a = analyzed[idx++];
      if (!a) continue;
      try {
        const deps = await client.getObjectDependencies({
          connectionId,
          schema,
          name: a.object.name,
          type: a.object.type as Parameters<McpClient['getObjectDependencies']>[0]['type'],
          transitive: false,
        });

        for (const edge of deps.edges) {
          const sourceId = `${edge.fromSchema}.${edge.fromName}:${edge.fromType}`;
          const targetId = `${edge.toSchema}.${edge.toName}:${edge.toType}`;
          const edgeId = `${sourceId}->${targetId}`;

          // Only include edges where both endpoints are in our node set
          if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;
          if (seenEdges.has(edgeId)) continue;
          seenEdges.add(edgeId);

          edges.push({
            group: 'edges',
            data: { id: edgeId, source: sourceId, target: targetId, edgeType: 'CALLS' },
            classes: deps.hasCircularDependency ? 'circular' : undefined,
          });
        }
      } catch {
        // Best-effort — skip objects whose dependencies can't be fetched
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, analyzed.length) }, worker));

  logger.info(`Graph built: ${nodes.length} nodes, ${edges.length} edges`);
  return [...nodes, ...edges];
}

/**
 * Build a single-object neighbourhood graph (direct deps + refs).
 */
export async function buildObjectGraph(
  connectionId: string,
  schema: string,
  name: string,
  type: string,
  client: McpClient,
): Promise<CyElement[]> {
  const [depsResult, refsResult] = await Promise.all([
    client.getObjectDependencies({
      connectionId, schema, name,
      type: type as Parameters<McpClient['getObjectDependencies']>[0]['type'],
      transitive: false,
    }),
    client.getObjectReferences({
      connectionId, schema, name,
      type: type as Parameters<McpClient['getObjectReferences']>[0]['type'],
    }),
  ]);

  const nodeMap = new Map<string, CyElement>();
  const edges: CyElement[] = [];
  const seenEdges = new Set<string>();

  const addNode = (s: string, n: string, t: string): void => {
    const id = `${s}.${n}:${t}`;
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        group: 'nodes',
        data: {
          id, label: n, objectId: id, type: t,
          color: colorFor(t), cc: 0, loc: 0, fanIn: 0, fanOut: 0,
          findings: 0, status: 'VALID',
        },
      });
    }
  };

  // Root object
  addNode(schema, name, type);

  for (const e of depsResult.edges) {
    addNode(e.fromSchema, e.fromName, e.fromType);
    addNode(e.toSchema, e.toName, e.toType);
    const edgeId = `${e.fromSchema}.${e.fromName}:${e.fromType}->${e.toSchema}.${e.toName}:${e.toType}`;
    if (!seenEdges.has(edgeId)) {
      seenEdges.add(edgeId);
      edges.push({
        group: 'edges',
        data: {
          id: edgeId,
          source: `${e.fromSchema}.${e.fromName}:${e.fromType}`,
          target: `${e.toSchema}.${e.toName}:${e.toType}`,
          edgeType: 'CALLS',
        },
        classes: depsResult.hasCircularDependency ? 'circular' : undefined,
      });
    }
  }

  for (const e of refsResult.referencedBy) {
    addNode(e.fromSchema, e.fromName, e.fromType);
    const edgeId = `${e.fromSchema}.${e.fromName}:${e.fromType}->${e.toSchema}.${e.toName}:${e.toType}`;
    if (!seenEdges.has(edgeId)) {
      seenEdges.add(edgeId);
      edges.push({
        group: 'edges',
        data: {
          id: edgeId,
          source: `${e.fromSchema}.${e.fromName}:${e.fromType}`,
          target: `${e.toSchema}.${e.toName}:${e.toType}`,
          edgeType: 'REFS',
        },
      });
    }
  }

  return [...nodeMap.values(), ...edges];
}
