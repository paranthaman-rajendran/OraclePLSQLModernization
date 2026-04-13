/**
 * Snapshot manager — wraps SqliteStore with high-level snapshot lifecycle.
 * Handles incremental analysis: objects unchanged since last snapshot are skipped.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SqliteStore } from './sqlite-store.js';
import type { AnalysisResult } from '../analysis/analysis-engine.js';
import type { Snapshot } from '@plsql-analyzer/shared';
import { logger } from '../util/logger.js';

export class SnapshotManager {
  constructor(private readonly store: SqliteStore) {}

  /**
   * Persist a full analysis result as a snapshot.
   * Returns the saved Snapshot header.
   */
  saveAnalysisResult(result: AnalysisResult, label?: string): Snapshot {
    const findings = [...result.findings, ...result.grantFindings];
    const metrics = result.metrics;

    const errorCount = findings.filter(f => f.severity === 'ERROR').length;
    const warnCount = findings.filter(f => f.severity === 'WARNING').length;
    const infoCount = findings.filter(f => f.severity === 'INFO').length;
    const avgCC = metrics.length > 0
      ? metrics.reduce((s, m) => s + m.cyclomaticComplexity, 0) / metrics.length
      : 0;
    const invalidCount = result.objects.filter(o => o.object.status !== 'VALID').length;
    const securityCount = findings.filter(f => f.category === 'SECURITY').length;

    const snapshot: Snapshot = {
      id: result.snapshotId,
      connectionId: result.connectionId,
      label: label ?? new Date().toISOString().replace('T', ' ').slice(0, 19),
      capturedAt: new Date(),
      objectCount: result.objects.length,
      findingCount: findings.length,
      summary: {
        errorCount,
        warningCount: warnCount,
        infoCount,
        avgCyclomaticComplexity: Math.round(avgCC * 10) / 10,
        invalidObjectCount: invalidCount,
        securityFindingCount: securityCount,
        totalObjects: result.objects.length,
      },
    };

    this.store.saveSnapshot(snapshot, result.schema);
    this.store.saveFindings(result.snapshotId, findings);
    this.store.saveMetrics(metrics);

    // Update DDL cache
    this.store.updateDdlCache(
      result.connectionId,
      result.schema,
      result.objects.map(o => ({
        name: o.object.name,
        type: o.object.type,
        lastDdlTime: o.object.lastDdlTime.toISOString(),
      })),
    );

    logger.info(`Snapshot saved: ${snapshot.id}`, `${snapshot.objectCount} objects, ${snapshot.findingCount} findings`);
    return snapshot;
  }

  /**
   * Returns the set of object keys (name:type) that have changed since the
   * last snapshot, or ALL objects if no snapshot exists.
   * Used by the analysis engine for incremental re-analysis.
   */
  getChangedObjects(
    connectionId: string,
    schema: string,
    currentObjects: Array<{ name: string; type: string; lastDdlTime: string }>,
  ): Set<string> {
    const cache = this.store.getDdlCache(connectionId, schema);
    if (cache.size === 0) {
      // No prior snapshot — analyze everything
      return new Set(currentObjects.map(o => `${o.name}:${o.type}`));
    }

    const changed = new Set<string>();
    for (const obj of currentObjects) {
      const key = `${obj.name}:${obj.type}`;
      const cached = cache.get(key);
      if (!cached || cached !== obj.lastDdlTime) {
        changed.add(key);
      }
    }

    logger.info(
      `Incremental analysis: ${changed.size}/${currentObjects.length} objects changed`,
    );
    return changed;
  }

  listSnapshots(connectionId: string, schema: string): Snapshot[] {
    return this.store.listSnapshots(connectionId, schema);
  }

  getLatest(connectionId: string, schema: string): Snapshot | undefined {
    return this.store.getLatestSnapshot(connectionId, schema);
  }

  compareWithPrevious(snapshotId: string, connectionId: string, schema: string) {
    const snapshots = this.store.listSnapshots(connectionId, schema);
    const idx = snapshots.findIndex(s => s.id === snapshotId);
    if (idx < 0 || idx >= snapshots.length - 1) return null;
    const previous = snapshots[idx + 1];
    if (!previous) return null;
    return this.store.compareSnapshots(previous.id, snapshotId);
  }
}
