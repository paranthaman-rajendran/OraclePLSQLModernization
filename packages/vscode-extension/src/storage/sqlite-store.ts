/**
 * SQLite persistence layer using better-sqlite3 (synchronous API).
 *
 * All tables live in a single database file at:
 *   ExtensionContext.globalStorageUri / plsql-analyzer.db
 *
 * Schema:
 *   snapshots    — point-in-time capture headers
 *   objects      — PLSQLObject metadata per snapshot
 *   findings     — Finding records per snapshot
 *   metrics      — Metric records per snapshot
 *   ddl_cache    — last_ddl_time per object for incremental analysis
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type Database from 'better-sqlite3';
import type { Finding, Metric, Snapshot, SnapshotSummary } from '@plsql-analyzer/shared';
import { logger } from '../util/logger.js';

// We use a dynamic require to handle the native addon
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3').default;

export class SqliteStore implements vscode.Disposable {
  private db: Database.Database | undefined;

  open(storageUri: vscode.Uri): void {
    const dir = storageUri.fsPath;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const dbPath = path.join(dir, 'plsql-analyzer.db');
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    logger.info('SQLite store opened', dbPath);
  }

  // ---------------------------------------------------------------------------
  // Schema migrations
  // ---------------------------------------------------------------------------

  private migrate(): void {
    const db = this.requireDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id            TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        label         TEXT NOT NULL,
        schema_name   TEXT NOT NULL,
        captured_at   TEXT NOT NULL,
        object_count  INTEGER NOT NULL DEFAULT 0,
        finding_count INTEGER NOT NULL DEFAULT 0,
        git_ref       TEXT,
        err_count     INTEGER NOT NULL DEFAULT 0,
        warn_count    INTEGER NOT NULL DEFAULT 0,
        info_count    INTEGER NOT NULL DEFAULT 0,
        avg_cc        REAL NOT NULL DEFAULT 0,
        invalid_count INTEGER NOT NULL DEFAULT 0,
        security_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS findings (
        id            TEXT NOT NULL,
        snapshot_id   TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        object_id     TEXT NOT NULL,
        rule_id       TEXT NOT NULL,
        category      TEXT NOT NULL,
        severity      TEXT NOT NULL,
        message       TEXT NOT NULL,
        suggestion    TEXT,
        line          INTEGER NOT NULL,
        col           INTEGER NOT NULL,
        end_line      INTEGER,
        end_col       INTEGER,
        cwe_id        TEXT,
        effort_mins   INTEGER,
        PRIMARY KEY (id, snapshot_id)
      );

      CREATE TABLE IF NOT EXISTS metrics (
        object_id     TEXT NOT NULL,
        snapshot_id   TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        computed_at   TEXT NOT NULL,
        cc            INTEGER NOT NULL DEFAULT 0,
        cog_cc        INTEGER NOT NULL DEFAULT 0,
        loc           INTEGER NOT NULL DEFAULT 0,
        exec_lines    INTEGER NOT NULL DEFAULT 0,
        comment_ratio REAL NOT NULL DEFAULT 0,
        nesting_depth INTEGER NOT NULL DEFAULT 0,
        param_count   INTEGER NOT NULL DEFAULT 0,
        fan_in        INTEGER NOT NULL DEFAULT 0,
        fan_out       INTEGER NOT NULL DEFAULT 0,
        dup_blocks    INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (object_id, snapshot_id)
      );

      CREATE TABLE IF NOT EXISTS ddl_cache (
        connection_id TEXT NOT NULL,
        schema_name   TEXT NOT NULL,
        object_name   TEXT NOT NULL,
        object_type   TEXT NOT NULL,
        last_ddl_time TEXT NOT NULL,
        PRIMARY KEY (connection_id, schema_name, object_name, object_type)
      );

      CREATE INDEX IF NOT EXISTS idx_findings_snapshot ON findings(snapshot_id);
      CREATE INDEX IF NOT EXISTS idx_findings_object   ON findings(object_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_snapshot  ON metrics(snapshot_id);
    `);
  }

  // ---------------------------------------------------------------------------
  // Snapshot CRUD
  // ---------------------------------------------------------------------------

  saveSnapshot(snapshot: Snapshot, schemaName: string): void {
    const db = this.requireDb();
    const { summary: s } = snapshot;
    db.prepare(`
      INSERT OR REPLACE INTO snapshots
        (id, connection_id, label, schema_name, captured_at, object_count, finding_count,
         git_ref, err_count, warn_count, info_count, avg_cc, invalid_count, security_count)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      snapshot.id, snapshot.connectionId, snapshot.label, schemaName,
      snapshot.capturedAt.toISOString(), snapshot.objectCount, snapshot.findingCount,
      snapshot.gitRef ?? null,
      s.errorCount, s.warningCount, s.infoCount,
      s.avgCyclomaticComplexity, s.invalidObjectCount, s.securityFindingCount,
    );
  }

  listSnapshots(connectionId: string, schemaName: string): Snapshot[] {
    const db = this.requireDb();
    const rows = db.prepare(`
      SELECT * FROM snapshots
      WHERE connection_id = ? AND schema_name = ?
      ORDER BY captured_at DESC
      LIMIT 50
    `).all(connectionId, schemaName) as SnapshotRow[];
    return rows.map(rowToSnapshot);
  }

  getLatestSnapshot(connectionId: string, schemaName: string): Snapshot | undefined {
    const db = this.requireDb();
    const row = db.prepare(`
      SELECT * FROM snapshots
      WHERE connection_id = ? AND schema_name = ?
      ORDER BY captured_at DESC
      LIMIT 1
    `).get(connectionId, schemaName) as SnapshotRow | undefined;
    return row ? rowToSnapshot(row) : undefined;
  }

  deleteSnapshot(snapshotId: string): void {
    this.requireDb().prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId);
  }

  // ---------------------------------------------------------------------------
  // Findings
  // ---------------------------------------------------------------------------

  saveFindings(snapshotId: string, findings: Finding[]): void {
    const db = this.requireDb();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO findings
        (id, snapshot_id, object_id, rule_id, category, severity, message, suggestion,
         line, col, end_line, end_col, cwe_id, effort_mins)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const saveAll = db.transaction((items: Finding[]) => {
      for (const f of items) {
        insert.run(
          f.id, snapshotId, f.objectId, f.ruleId, f.category, f.severity,
          f.message, f.suggestion ?? null,
          f.location.line, f.location.column,
          f.location.endLine ?? null, f.location.endColumn ?? null,
          f.cweId ?? null, f.effortMinutes ?? null,
        );
      }
    });
    saveAll(findings);
  }

  loadFindings(snapshotId: string): Finding[] {
    const rows = this.requireDb().prepare(
      'SELECT * FROM findings WHERE snapshot_id = ? ORDER BY object_id, line',
    ).all(snapshotId) as FindingRow[];
    return rows.map(rowToFinding);
  }

  loadFindingsForObject(snapshotId: string, objectId: string): Finding[] {
    const rows = this.requireDb().prepare(
      'SELECT * FROM findings WHERE snapshot_id = ? AND object_id = ? ORDER BY line',
    ).all(snapshotId, objectId) as FindingRow[];
    return rows.map(rowToFinding);
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  saveMetrics(metrics: Metric[]): void {
    const db = this.requireDb();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO metrics
        (object_id, snapshot_id, computed_at, cc, cog_cc, loc, exec_lines,
         comment_ratio, nesting_depth, param_count, fan_in, fan_out, dup_blocks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const saveAll = db.transaction((items: Metric[]) => {
      for (const m of items) {
        insert.run(
          m.objectId, m.snapshotId, m.computedAt.toISOString(),
          m.cyclomaticComplexity, m.cognitiveComplexity, m.linesOfCode, m.executableLines,
          m.commentRatio, m.nestingDepth, m.parameterCount,
          m.coupling.fanIn, m.coupling.fanOut, m.duplicateBlockCount,
        );
      }
    });
    saveAll(metrics);
  }

  loadMetrics(snapshotId: string): Metric[] {
    const rows = this.requireDb().prepare(
      'SELECT * FROM metrics WHERE snapshot_id = ? ORDER BY object_id',
    ).all(snapshotId) as MetricRow[];
    return rows.map(rowToMetric);
  }

  // ---------------------------------------------------------------------------
  // DDL cache (for incremental analysis)
  // ---------------------------------------------------------------------------

  updateDdlCache(
    connectionId: string,
    schemaName: string,
    objects: Array<{ name: string; type: string; lastDdlTime: string }>,
  ): void {
    const db = this.requireDb();
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO ddl_cache (connection_id, schema_name, object_name, object_type, last_ddl_time)
      VALUES (?,?,?,?,?)
    `);
    const saveAll = db.transaction(() => {
      for (const o of objects) {
        upsert.run(connectionId, schemaName, o.name, o.type, o.lastDdlTime);
      }
    });
    saveAll();
  }

  getDdlCache(connectionId: string, schemaName: string): Map<string, string> {
    const rows = this.requireDb().prepare(
      'SELECT object_name, object_type, last_ddl_time FROM ddl_cache WHERE connection_id = ? AND schema_name = ?',
    ).all(connectionId, schemaName) as Array<{ object_name: string; object_type: string; last_ddl_time: string }>;

    return new Map(rows.map(r => [`${r.object_name}:${r.object_type}`, r.last_ddl_time]));
  }

  // ---------------------------------------------------------------------------
  // Snapshot diff (for Phase 3 regression alerts)
  // ---------------------------------------------------------------------------

  compareSnapshots(
    snapshotIdA: string,
    snapshotIdB: string,
  ): { added: Finding[]; removed: Finding[]; unchanged: Finding[] } {
    const a = new Map(this.loadFindings(snapshotIdA).map(f => [f.id, f]));
    const b = new Map(this.loadFindings(snapshotIdB).map(f => [f.id, f]));

    const added = [...b.values()].filter(f => !a.has(f.id));
    const removed = [...a.values()].filter(f => !b.has(f.id));
    const unchanged = [...b.values()].filter(f => a.has(f.id));

    return { added, removed, unchanged };
  }

  dispose(): void {
    this.db?.close();
    this.db = undefined;
  }

  private requireDb(): Database.Database {
    if (!this.db) throw new Error('SqliteStore not opened. Call open() first.');
    return this.db;
  }
}

// ---------------------------------------------------------------------------
// Row → domain type mappers
// ---------------------------------------------------------------------------

interface SnapshotRow {
  id: string; connection_id: string; label: string; captured_at: string;
  object_count: number; finding_count: number; git_ref: string | null;
  err_count: number; warn_count: number; info_count: number;
  avg_cc: number; invalid_count: number; security_count: number;
}

function rowToSnapshot(r: SnapshotRow): Snapshot {
  return {
    id: r.id,
    connectionId: r.connection_id,
    label: r.label,
    capturedAt: new Date(r.captured_at),
    objectCount: r.object_count,
    findingCount: r.finding_count,
    gitRef: r.git_ref ?? undefined,
    summary: {
      errorCount: r.err_count,
      warningCount: r.warn_count,
      infoCount: r.info_count,
      avgCyclomaticComplexity: r.avg_cc,
      invalidObjectCount: r.invalid_count,
      securityFindingCount: r.security_count,
      totalObjects: r.object_count,
    },
  };
}

interface FindingRow {
  id: string; snapshot_id: string; object_id: string; rule_id: string;
  category: string; severity: string; message: string; suggestion: string | null;
  line: number; col: number; end_line: number | null; end_col: number | null;
  cwe_id: string | null; effort_mins: number | null;
}

function rowToFinding(r: FindingRow): Finding {
  return {
    id: r.id,
    objectId: r.object_id,
    ruleId: r.rule_id,
    category: r.category as Finding['category'],
    severity: r.severity as Finding['severity'],
    message: r.message,
    suggestion: r.suggestion ?? undefined,
    location: {
      line: r.line, column: r.col,
      endLine: r.end_line ?? undefined, endColumn: r.end_col ?? undefined,
    },
    cweId: r.cwe_id ?? undefined,
    effortMinutes: r.effort_mins ?? undefined,
  };
}

interface MetricRow {
  object_id: string; snapshot_id: string; computed_at: string;
  cc: number; cog_cc: number; loc: number; exec_lines: number;
  comment_ratio: number; nesting_depth: number; param_count: number;
  fan_in: number; fan_out: number; dup_blocks: number;
}

function rowToMetric(r: MetricRow): Metric {
  return {
    objectId: r.object_id,
    snapshotId: r.snapshot_id,
    computedAt: new Date(r.computed_at),
    cyclomaticComplexity: r.cc,
    cognitiveComplexity: r.cog_cc,
    linesOfCode: r.loc,
    executableLines: r.exec_lines,
    commentRatio: r.comment_ratio,
    nestingDepth: r.nesting_depth,
    parameterCount: r.param_count,
    coupling: { fanIn: r.fan_in, fanOut: r.fan_out },
    duplicateBlockCount: r.dup_blocks,
  };
}
