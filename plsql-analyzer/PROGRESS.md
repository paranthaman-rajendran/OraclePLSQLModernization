# PL/SQL Analyzer — Build Progress Tracker

**Last updated:** 2026-04-13  
**Codebase:** `E:/developer/Cluade/DocumentationFromCode/plsql-analyzer/`  
**Total:** 89 TypeScript source files · ~10,300 LOC · 5 packages

---

## Legend

| Symbol | Meaning                                          |
| ------ | ------------------------------------------------ |
| ✅     | Complete and verified                            |
| ⚠️     | Partial / stub intentionally deferred            |
| 🔴     | Known bug / broken                               |
| 🧹     | Dead code (safe to delete, no functional impact) |
| 🔲     | Not started                                      |

---

## Package Overview

| Package                      | Purpose                          | Files |    LOC | Status        |
| ---------------------------- | -------------------------------- | ----: | -----: | ------------- |
| `shared/`                    | Domain types + Zod MCP contracts |     3 |   ~650 | ✅ Complete   |
| `packages/analysis/`         | Portable engine (no vscode dep)  |    15 | ~1,400 | ✅ Complete   |
| `packages/mcp-server/`       | Oracle MCP server (stdio)        |    27 | ~2,800 | ⚠️ Vault stub |
| `packages/vscode-extension/` | VS Code extension                |    36 | ~4,600 | ✅ Complete   |
| `packages/cli/`              | `plsql-analyze` CLI binary       |     8 |   ~850 | ✅ Complete   |

---

## Phase 0 — Foundation ✅

### `shared/`

| Item                                                     | File                   | Status |
| -------------------------------------------------------- | ---------------------- | ------ |
| Domain types (PLSQLObject, Finding, Metric, Snapshot, …) | `src/domain.ts`        | ✅     |
| Zod MCP contracts (14 tool schemas)                      | `src/mcp-contracts.ts` | ✅     |
| Package barrel export                                    | `src/index.ts`         | ✅     |

### `packages/mcp-server/`

| Item                                 | File                                   | Status                                                                 |
| ------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| Stdio MCP server entry               | `src/index.ts`                         | ✅                                                                     |
| Server + tool registration           | `src/server.ts`                        | ✅                                                                     |
| Oracle connection pool               | `src/oracle/connection.ts`             | ✅                                                                     |
| SQL query library                    | `src/oracle/queries.ts`                | ✅                                                                     |
| **list_schemas** tool                | `src/tools/list-schemas.ts`            | ✅                                                                     |
| **list_objects** tool                | `src/tools/list-objects.ts`            | ✅                                                                     |
| **get_object_source** tool           | `src/tools/get-object-source.ts`       | ✅                                                                     |
| **get_package_spec** tool            | `src/tools/get-package-spec.ts`        | ✅                                                                     |
| **get_object_dependencies** tool     | `src/tools/get-object-dependencies.ts` | ✅                                                                     |
| **get_object_references** tool       | `src/tools/get-object-references.ts`   | ✅                                                                     |
| **list_tables** tool                 | `src/tools/list-tables.ts`             | ✅                                                                     |
| **get_table_detail** tool            | `src/tools/get-table-detail.ts`        | ✅                                                                     |
| **list_views** tool                  | `src/tools/list-views.ts`              | ✅                                                                     |
| **get_invalid_objects** tool         | `src/tools/get-invalid-objects.ts`     | ✅                                                                     |
| **get_grants** tool                  | `src/tools/get-grants.ts`              | ✅                                                                     |
| **get_db_links** tool                | `src/tools/get-db-links.ts`            | ✅                                                                     |
| **search_source** tool               | `src/tools/search-source.ts`           | ✅                                                                     |
| **get_compile_errors** tool          | `src/tools/get-compile-errors.ts`      | ✅                                                                     |
| Credential chain — env vars          | `src/credentials/env-provider.ts`      | ✅                                                                     |
| Credential chain — dotenv (.env)     | `src/credentials/dotenv-provider.ts`   | ✅                                                                     |
| Credential chain — Oracle Wallet     | `src/credentials/wallet-provider.ts`   | ✅                                                                     |
| Credential chain — Vault (stub)      | `src/credentials/vault-provider.ts`    | ⚠️ Throws `NotImplementedError`; HashiCorp / Azure / AWS hooks stubbed |
| Credential resolver (priority chain) | `src/credentials/resolver.ts`          | ✅                                                                     |

### `packages/vscode-extension/` — Phase 0 items

| Item                                       | File                                     | Status                       |
| ------------------------------------------ | ---------------------------------------- | ---------------------------- |
| MCP server manager (spawn + lifecycle)     | `src/mcp/server-manager.ts`              | ✅                           |
| MCP client (typed wrapper, 14 tools)       | `src/mcp/client.ts`                      | ✅                           |
| Stdio transport                            | `src/mcp/transport.ts`                   | ✅                           |
| Connection Manager (state + persistence)   | `src/connections/connection-manager.ts`  | ✅                           |
| Connection commands (connect/test/remove)  | `src/connections/connection-commands.ts` | ✅                           |
| Connections TreeView                       | `src/connections/connection-tree.ts`     | ✅                           |
| Credential input UI                        | `src/credentials/credential-ui.ts`       | ✅                           |
| Secret Storage adapter                     | `src/credentials/secret-storage.ts`      | ✅                           |
| Logger (VS Code Output Channel)            | `src/util/logger.ts`                     | ✅                           |
| Extension entry point (Phase 0 activation) | `src/extension.ts`                       | ✅ (updated through Phase 3) |

---

## Phase 1 — Analysis Engine ✅

### `packages/analysis/` ← canonical engine, no vscode dependency

| Item                                           | File                                          | Status |
| ---------------------------------------------- | --------------------------------------------- | ------ |
| Logger interface + console/noop impls          | `src/logger.ts`                               | ✅     |
| AST node types (35 node kinds)                 | `src/parser/ast-types.ts`                     | ✅     |
| Pattern-based PL/SQL parser (470 LOC)          | `src/parser/plsql-parser.ts`                  | ✅     |
| Rule registry types + `findingId()` + defaults | `src/rules/rule-registry.ts`                  | ✅     |
| **PLSQL-Q001** Cyclomatic Complexity           | `src/rules/quality/cyclomatic-complexity.ts`  | ✅     |
| **PLSQL-Q002** Nesting Depth                   | `src/rules/quality/nesting-depth.ts`          | ✅     |
| **PLSQL-Q003** Parameter Count                 | `src/rules/quality/parameter-count.ts`        | ✅     |
| **PLSQL-Q004** Routine Length                  | `src/rules/quality/routine-length.ts`         | ✅     |
| **PLSQL-Q005** Comment Ratio                   | `src/rules/quality/comment-ratio.ts`          | ✅     |
| **PLSQL-S001** SQL Injection (CWE-89)          | `src/rules/security/sql-injection.ts`         | ✅     |
| **PLSQL-S002** Hardcoded Credentials (CWE-798) | `src/rules/security/hardcoded-credentials.ts` | ✅     |
| **PLSQL-S003** Excessive Grants (CWE-269)      | `src/rules/security/excessive-grants.ts`      | ✅     |
| **PLSQL-S004** Exception Suppression (CWE-390) | `src/rules/security/exception-suppression.ts` | ✅     |
| Engine: `AnalysisClient` interface             | `src/engine.ts`                               | ✅     |
| Engine: `analyzeSchema()` (parallel, capped)   | `src/engine.ts`                               | ✅     |
| Engine: `analyzeObject()` (single object)      | `src/engine.ts`                               | ✅     |
| Engine: coupling enrichment (fan-in via refs)  | `src/engine.ts`                               | ✅     |
| Package public API barrel                      | `src/index.ts`                                | ✅     |

### `packages/vscode-extension/` — Phase 1 items

| Item                                                         | File                                  | Status |
| ------------------------------------------------------------ | ------------------------------------- | ------ |
| Analysis engine adapter (bridges McpClient → AnalysisClient) | `src/analysis/analysis-engine.ts`     | ✅     |
| VS Code Diagnostics (virtual `plsql-object://` URI scheme)   | `src/analysis/diagnostics.ts`         | ✅     |
| Code Lens (complexity / callers / risk badges)               | `src/analysis/code-lens.ts`           | ✅     |
| Hover provider (signature + metrics + findings)              | `src/analysis/hover.ts`               | ✅     |
| `analyzeSchema` command (Ctrl+Shift+A)                       | `src/analysis/analysis-commands.ts`   | ✅     |
| `analyzeObject` command (Ctrl+Shift+O)                       | `src/analysis/analysis-commands.ts`   | ✅     |
| `refreshSchema` command (Ctrl+Shift+R)                       | `src/analysis/analysis-commands.ts`   | ✅     |
| Local rule-registry re-export shim                           | `src/analysis/rules/rule-registry.ts` | ✅     |

> **🧹 Dead code:** `packages/vscode-extension/src/analysis/parser/` and `src/analysis/rules/quality+security/` are local copies that were superseded when the engine moved to `@plsql-analyzer/analysis`. Nothing imports them from outside the `analysis/` subtree. **Safe to delete; no functional impact.**

---

## Phase 2 — Dependency Graph, Dashboard, Snapshots ✅

### `packages/vscode-extension/` — Phase 2 items

| Item                                                      | File                                   | Status |
| --------------------------------------------------------- | -------------------------------------- | ------ |
| CyNode / CyEdge types + schema-level graph builder        | `src/graph/dependency-graph.ts`        | ✅     |
| Single-object neighbourhood graph builder                 | `src/graph/dependency-graph.ts`        | ✅     |
| Cytoscape.js webview HTML (filter, search, export SVG)    | `src/graph/webview/graph-webview.html` | ✅     |
| WebviewPanel singleton (GraphPanel)                       | `src/graph/graph-panel.ts`             | ✅     |
| `showDependencies` command (Ctrl+Shift+D)                 | `src/extension.ts`                     | ✅     |
| `showObjectDependencies` command                          | `src/extension.ts`                     | ✅     |
| Schema Dashboard webview (cards, bar charts)              | `src/views/dashboard-panel.ts`         | ✅     |
| `showDashboard` command                                   | `src/extension.ts`                     | ✅     |
| Self-contained HTML report generator                      | `src/docs/report-generator.ts`         | ✅     |
| `exportReport` command                                    | `src/extension.ts`                     | ✅     |
| SQLite store (snapshots / findings / metrics / ddl_cache) | `src/storage/sqlite-store.ts`          | ✅     |
| SnapshotManager (save / incremental diff / history)       | `src/storage/snapshot.ts`              | ✅     |
| Auto-snapshot after `analyzeSchema`                       | `src/extension.ts`                     | ✅     |
| esbuild — copies graph-webview.html → dist/webview/       | `esbuild.mjs`                          | ✅     |

> **⚠️ Manual step required:** `resources/cytoscape.min.js` must be downloaded from `https://unpkg.com/cytoscape/dist/cytoscape.min.js` and placed in `packages/vscode-extension/resources/`. The file is not committed to the repo (binary). Graph panel falls back to error HTML if missing.

---

## Phase 3 — CLI, Backlog, Integrations ✅

### `packages/cli/`

| Item                                                   | File                           | Status |
| ------------------------------------------------------ | ------------------------------ | ------ |
| CLI entry point (commander)                            | `src/index.ts`                 | ✅     |
| **analyze** command (connect → analyze → output)       | `src/commands/analyze.ts`      | ✅     |
| **init** command (scaffold .plsql-analyzer.json)       | `src/commands/init.ts`         | ✅     |
| **install-hook** command (git pre-push)                | `src/commands/install-hook.ts` | ✅     |
| **remove-hook** command                                | `src/commands/install-hook.ts` | ✅     |
| Config loader (.plsql-analyzer.json + env vars + .env) | `src/lib/config.ts`            | ✅     |
| CLI MCP client (spawns mcp-server subprocess)          | `src/lib/cli-mcp-client.ts`    | ✅     |
| Text formatter (chalk, grouped by object)              | `src/output/text-formatter.ts` | ✅     |
| SARIF 2.1.0 formatter (GitHub / Azure Code Scanning)   | `src/output/sarif.ts`          | ✅     |
| Exit codes: 0=clean 1=findings 2=tool-error            | `src/commands/analyze.ts`      | ✅     |
| CI bypass: `SKIP_PLSQL=1` env var for hook             | `src/commands/install-hook.ts` | ✅     |
| Output formats: `text` / `json` / `sarif`              | —                              | ✅     |

### `packages/vscode-extension/` — Phase 3 items

| Item                                                        | File                                | Status |
| ----------------------------------------------------------- | ----------------------------------- | ------ |
| Refactoring Backlog TreeView (ranked by effort × severity)  | `src/views/backlog-tree.ts`         | ✅     |
| Backlog auto-update after `analyzeSchema`                   | `src/extension.ts`                  | ✅     |
| `clearBacklog` command + toolbar button                     | `src/extension.ts`                  | ✅     |
| JIRA Cloud REST API v3 client (ADF descriptions)            | `src/integrations/jira-client.ts`   | ✅     |
| Issue tracker dispatcher (JIRA + Linear)                    | `src/integrations/issue-tracker.ts` | ✅     |
| Linear GraphQL issue creation (fetch, no external SDK)      | `src/integrations/issue-tracker.ts` | ✅     |
| `createTicket` command (context menu on backlog finding)    | `src/extension.ts`                  | ✅     |
| `configureJira` command (stores API token in SecretStorage) | `src/extension.ts`                  | ✅     |
| `configureLinear` command (stores API key in SecretStorage) | `src/extension.ts`                  | ✅     |
| JIRA settings (baseUrl / projectKey / issueType)            | `package.json`                      | ✅     |
| Linear settings (teamId / labelId)                          | `package.json`                      | ✅     |
| Context menus (`view/item/context` for backlog findings)    | `package.json`                      | ✅     |
| `plsqlRefactoringBacklog` TreeView registered               | `src/extension.ts`                  | ✅     |

---

## Build System ✅

| Item                                                                      | File                                    | Status |
| ------------------------------------------------------------------------- | --------------------------------------- | ------ |
| Root build script (ordered: shared → analysis → server → extension → cli) | `package.json`                          | ✅     |
| Base TypeScript config (strict, ES2022, bundler resolution)               | `tsconfig.base.json`                    | ✅     |
| `shared` — tsc build to `dist/`                                           | `shared/package.json`                   | ✅     |
| `packages/analysis` — tsc build with declarations                         | `packages/analysis/package.json`        | ✅     |
| `packages/mcp-server` — esbuild ESM bundle                                | `packages/mcp-server/esbuild.mjs`       | ✅     |
| `packages/vscode-extension` — esbuild CJS bundle + HTML copy              | `packages/vscode-extension/esbuild.mjs` | ✅     |
| `packages/cli` — esbuild ESM bundle with shebang                          | `packages/cli/esbuild.mjs`              | ✅     |
| npm workspaces — all 5 packages linked                                    | `package.json`                          | ✅     |

---

## Known Issues & Gaps

### 🧹 Dead Code (non-blocking)

| Issue                                                                                               | Location                                                                                    | Action                                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Local copies of parser + 9 rule files are orphaned since engine moved to `@plsql-analyzer/analysis` | `packages/vscode-extension/src/analysis/parser/` and `src/analysis/rules/quality+security/` | Delete the directories. Nothing imports them. |

### ⚠️ Stubs / Intentional Deferrals

| Item                                    | Location                                                | Notes                                                                |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| HashiCorp Vault credential provider     | `packages/mcp-server/src/credentials/vault-provider.ts` | Throws `NotImplementedError`. Wire real Vault HTTP API to implement. |
| Azure Key Vault credential provider     | same                                                    | Deferred                                                             |
| AWS Secrets Manager credential provider | same                                                    | Deferred                                                             |

### ⚠️ Manual Setup Required

| Item                                 | Action Required                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `cytoscape.min.js` for graph webview | Download from `https://unpkg.com/cytoscape/dist/cytoscape.min.js` → place at `packages/vscode-extension/resources/cytoscape.min.js` |
| Oracle driver native addon           | `node-oracledb` requires Oracle Instant Client on the machine running the MCP server                                                |
| `better-sqlite3` native addon        | Requires a build toolchain (or pre-built binary) matching the VS Code extension host Node version                                   |

### 🔲 Not Yet Started (Phase 4 candidates)

| Feature                                                                         | Priority | Notes                                                                       |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| **Snapshot diff viewer** — show regression since prior snapshot                 | High     | SQLite diff logic exists (`compareSnapshots`); UI not built                 |
| **Schema Explorer TreeView** — populate `plsqlSchemaExplorer` with live objects | Medium   | Registered but empty; fill with objects from last analysis                  |
| **On-save analysis** — wire `plsqlAnalyzer.analysisOnSave` setting              | Medium   | Config key exists; `workspace.onDidSaveTextDocument` handler not registered |
| **Snapshot history panel** — list/compare past snapshots                        | Medium   | `listSnapshots()` exists in SnapshotManager; no UI                          |
| **Duplicate block detection** — `duplicateBlockCount` field is always 0         | Low      | Requires rabin-fingerprint or suffix-array implementation                   |
| **ANTLR4 parser upgrade** — replace regex parser with full grammar              | Low      | Architecture supports drop-in swap; `ParsedObject` shape unchanged          |
| **Test suite** — mocha/vitest unit tests                                        | High     | Zero tests written                                                          |
| **VSIX packaging** — marketplace-ready `.vsix`                                  | Medium   | `vsce package` script exists; needs icon + README                           |

---

## Dependency Graph (build order)

```
shared
  └── packages/analysis          (depends on: shared)
        ├── packages/mcp-server  (depends on: shared)
        ├── packages/vscode-extension (depends on: shared, analysis)
        └── packages/cli         (depends on: shared, analysis)
```

---

## Command Reference

### Extension commands

| Command                                 | Keybinding   | Phase |
| --------------------------------------- | ------------ | ----- |
| `plsql-analyzer.connect`                | —            | 0     |
| `plsql-analyzer.addConnection`          | —            | 0     |
| `plsql-analyzer.removeConnection`       | —            | 0     |
| `plsql-analyzer.testConnection`         | —            | 0     |
| `plsql-analyzer.analyzeSchema`          | Ctrl+Shift+A | 1     |
| `plsql-analyzer.analyzeObject`          | Ctrl+Shift+O | 1     |
| `plsql-analyzer.refreshSchema`          | Ctrl+Shift+R | 1     |
| `plsql-analyzer.showDependencies`       | Ctrl+Shift+D | 2     |
| `plsql-analyzer.showObjectDependencies` | —            | 2     |
| `plsql-analyzer.showDashboard`          | —            | 2     |
| `plsql-analyzer.exportReport`           | —            | 2     |
| `plsql-analyzer.createTicket`           | —            | 3     |
| `plsql-analyzer.configureJira`          | —            | 3     |
| `plsql-analyzer.configureLinear`        | —            | 3     |
| `plsql-analyzer.clearBacklog`           | —            | 3     |

### CLI commands

```bash
plsql-analyze init                          # scaffold .plsql-analyzer.json
plsql-analyze analyze                       # text output, exit 1 on errors
plsql-analyze analyze --format sarif        # SARIF for GitHub/Azure
plsql-analyze analyze --format json         # raw JSON
plsql-analyze analyze --fail-on warning     # stricter CI gate
plsql-analyze install-hook                  # git pre-push hook
plsql-analyze install-hook --force          # overwrite existing hook
plsql-analyze remove-hook
SKIP_PLSQL=1 git push origin main           # bypass hook
```

---

## Rules Reference

| Rule ID        | Name                  | Category        | Severity      | CWE     | Effort       |
| -------------- | --------------------- | --------------- | ------------- | ------- | ------------ |
| PLSQL-Q001     | Cyclomatic Complexity | QUALITY         | ERROR/WARNING | —       | CC×10–15 min |
| PLSQL-Q002     | Nesting Depth         | QUALITY         | WARNING       | —       | 30 min       |
| PLSQL-Q003     | Parameter Count       | QUALITY         | WARNING       | —       | 45 min       |
| PLSQL-Q004     | Routine Length        | MAINTAINABILITY | WARNING       | —       | 60 min       |
| PLSQL-Q005     | Comment Ratio         | MAINTAINABILITY | INFO          | —       | 20 min       |
| PLSQL-S001     | SQL Injection         | SECURITY        | ERROR/WARNING | CWE-89  | 30 min       |
| PLSQL-S002     | Hardcoded Credentials | SECURITY        | WARNING       | CWE-798 | 45 min       |
| PLSQL-S003     | Excessive Grants      | SECURITY        | ERROR/WARNING | CWE-269 | 30–60 min    |
| PLSQL-S004     | Exception Suppression | SECURITY        | ERROR/WARNING | CWE-390 | 20 min       |
| ORACLE-COMPILE | Compilation Error     | QUALITY         | ERROR/WARNING | —       | varies       |
