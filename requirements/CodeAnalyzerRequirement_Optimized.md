# PL/SQL Code Analyzer — VS Code Extension

#### Requirement Specification — GenAI-Optimized Prompt | v1.4

---

## Table of Contents

| #    | Section                                                             |
| ---- | ------------------------------------------------------------------- |
| 1    | [System Context](#1-system-context)                                 |
| 2    | [Problem Statement](#2-problem-statement)                           |
| 3    | [Goals & Success Criteria](#3-goals--success-criteria)              |
| 4    | [Functional Requirements](#4-functional-requirements)               |
| 4.1  | &nbsp;&nbsp;Database MCP Server — Schema & Object Discovery         |
| 4.1a | &nbsp;&nbsp;&nbsp;&nbsp;Credential Externalization & Security       |
| 4.2  | &nbsp;&nbsp;Core Parsing & Analysis                                 |
| 4.3  | &nbsp;&nbsp;Code Quality Metrics                                    |
| 4.4  | &nbsp;&nbsp;Security Analysis                                       |
| 4.5  | &nbsp;&nbsp;Refactoring & Migration Guidance                        |
| 4.6  | &nbsp;&nbsp;Documentation Generation                                |
| 4.7  | &nbsp;&nbsp;Reporting & Visualization                               |
| 5    | [Non-Functional Requirements](#5-non-functional-requirements)       |
| 6    | [VS Code Extension Requirements](#6-vs-code-extension-requirements) |
| 6.1  | &nbsp;&nbsp;Extension UI & Panels                                   |
| 6.2  | &nbsp;&nbsp;Editor Integration                                      |
| 6.3  | &nbsp;&nbsp;Commands & Keyboard Shortcuts                           |
| 7    | [Integration Requirements](#7-integration-requirements)             |
| 7.1  | &nbsp;&nbsp;Version Control (Git)                                   |
| 7.2  | &nbsp;&nbsp;CI/CD Pipeline                                          |
| 7.3  | &nbsp;&nbsp;Automated Testing                                       |
| 7.4  | &nbsp;&nbsp;JIRA / Issue Tracking                                   |
| 7.5  | &nbsp;&nbsp;Historical Analysis                                     |
| 8    | [Implementation Guidance](#8-implementation-guidance)               |
| 9    | [Build Plan](#9-build-plan)                                         |
| 10   | [Expected Deliverables](#10-expected-deliverables)                  |

---

## 1. System Context

> **AI Role:** You are a senior VS Code extension developer, database architect, and static analysis expert.

Design and implement a **PL/SQL Code Analyzer as a VS Code Extension**. The extension connects to a live Oracle database via a **Database MCP (Model Context Protocol) Server** to fetch real schema objects, PL/SQL source, table definitions, and dependency metadata — and then performs deep static analysis directly inside the developer's IDE.

The tool must surface actionable insights for refactoring, migration, quality enforcement, and documentation without requiring developers to leave VS Code.

---

## 2. Problem Statement

A large legacy application stores critical business logic in Oracle PL/SQL. The engineering team lacks visibility into:

- The full structure and cross-object dependencies of the PL/SQL codebase
- Where complexity, duplication, and security risks are concentrated
- Which objects are safe to refactor or migrate vs. which carry high risk
- What tables and schema structures the PL/SQL code operates on
- What the code actually does — documentation is sparse or absent

The team works inside **VS Code** and needs analysis embedded in their existing workflow, connected to the live database as the source of truth.

---

## 3. Goals & Success Criteria

| #   | Goal                  | Success Criteria                                                                        |
| --- | --------------------- | --------------------------------------------------------------------------------------- |
| G1  | Live DB connectivity  | MCP server connects to Oracle and fetches all PL/SQL objects, tables, and schema detail |
| G2  | Structural visibility | Full call graph and dependency map generated from live database objects                 |
| G3  | Quality enforcement   | Configurable quality thresholds with inline VS Code diagnostics                         |
| G4  | Safe refactoring      | Risk-ranked refactoring candidates with migration readiness scores                      |
| G5  | Documentation         | Auto-generated docs accessible in VS Code hover tooltips and side panels                |
| G6  | Security posture      | All SQL injection, privilege, and credential risks surfaced as VS Code diagnostics      |
| G7  | Developer adoption    | Extension installable from VS Code Marketplace; usable without external tooling         |

---

## 4. Functional Requirements

### 4.1 Database MCP Server — Schema & Object Discovery

`Priority: P0 — MVP` | This is the data foundation for all other analysis

The MCP server connects to the Oracle database and exposes structured data about all schema objects to the extension. It is the **single source of truth** — analysis is performed against live database metadata, not just local files.

**MCP Tools the server must expose:**

| ID      | MCP Tool                  | Description                                                                                 |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| FR-1.1  | `list_schemas`            | Return all accessible schemas/owners in the connected database                              |
| FR-1.2  | `list_objects`            | Return all objects in a schema: procedures, functions, packages, triggers, types, sequences |
| FR-1.3  | `get_object_source`       | Return full PL/SQL source code (DDL) for a named object                                     |
| FR-1.4  | `get_package_spec`        | Return the package specification (interface) separately from the body                       |
| FR-1.5  | `get_object_dependencies` | Return all objects that a given object depends on (direct + transitive)                     |
| FR-1.6  | `get_object_references`   | Return all objects that reference (call or use) a given object                              |
| FR-1.7  | `list_tables`             | Return all tables in a schema with column names, data types, constraints, and indexes       |
| FR-1.8  | `get_table_detail`        | Return full DDL for a table including columns, PKs, FKs, indexes, and comments              |
| FR-1.9  | `list_views`              | Return all views with their defining SQL                                                    |
| FR-1.10 | `get_invalid_objects`     | Return all objects currently marked INVALID in `ALL_OBJECTS`                                |
| FR-1.11 | `get_grants`              | Return all GRANT statements for a schema — used for privilege analysis                      |
| FR-1.12 | `get_db_links`            | Return all database links — used for cross-database dependency tracking                     |
| FR-1.13 | `search_source`           | Full-text search across all PL/SQL source in the database                                   |
| FR-1.14 | `get_compile_errors`      | Return current compilation errors from `ALL_ERRORS` for any object                          |

**MCP Resources the server must expose:**

| ID      | Resource URI Pattern                     | Description                               |
| ------- | ---------------------------------------- | ----------------------------------------- |
| FR-1.15 | `oracle://{schema}/objects`              | Browsable list of all objects in a schema |
| FR-1.16 | `oracle://{schema}/{object_type}/{name}` | Source code of a specific named object    |
| FR-1.17 | `oracle://{schema}/tables/{table_name}`  | Full detail for a specific table          |
| FR-1.18 | `oracle://{schema}/dependencies/{name}`  | Dependency tree for a specific object     |

**Connection Configuration:**

| ID      | Requirement                                                                        |
| ------- | ---------------------------------------------------------------------------------- |
| FR-1.19 | Support Oracle connection via TNS name, Easy Connect string, and Oracle Wallet     |
| FR-1.20 | Support multiple named connection profiles (name only) stored in VS Code settings  |
| FR-1.21 | Support Oracle Instant Client (thin mode) — no full Oracle Client install required |

---

### 4.1a Credential Externalization & Security

`Priority: P0 — MVP` | Credentials must never appear in source code, config files, logs, or GenAI agent context

#### Credential Resolution Priority Order

The MCP server must resolve credentials by checking sources in this exact order, stopping at the first match:

| Priority | Source                      | Description                                                                                |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| 1        | **Environment Variables**   | `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` — always checked first           |
| 2        | **`.env` file**             | Project-local `.env` file loaded via `dotenv`; must be listed in `.gitignore` by default   |
| 3        | **Oracle Wallet**           | Directory path set via `TNS_ADMIN` env var or `oracle.walletPath` VS Code setting          |
| 4        | **External Secret Manager** | Vault/Key Vault/Secrets Manager URL configured in settings; secret fetched at runtime      |
| 5        | **VS Code SecretStorage**   | Encrypted OS keychain via VS Code `SecretStorage` API — used only for interactive sessions |

#### Environment Variable Reference

| Variable                | Description                                     | Example                       |
| ----------------------- | ----------------------------------------------- | ----------------------------- |
| `ORACLE_USER`           | Database username                               | `hr_readonly`                 |
| `ORACLE_PASSWORD`       | Database password                               | _(never logged or displayed)_ |
| `ORACLE_CONNECT_STRING` | Easy Connect or TNS alias                       | `host:1521/ORCL` or `MYDB`    |
| `ORACLE_WALLET_DIR`     | Path to Oracle Wallet directory                 | `/opt/oracle/wallet`          |
| `TNS_ADMIN`             | Path to `tnsnames.ora` / `sqlnet.ora` directory | `/opt/oracle/network/admin`   |
| `ORACLE_PROFILE`        | Named connection profile to activate            | `prod`, `dev`, `staging`      |

#### External Secret Manager Support

| ID      | Requirement                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| FR-1.22 | Support **HashiCorp Vault** — fetch secret at path configured in settings (`oracle.vault.secretPath`)                          |
| FR-1.23 | Support **Azure Key Vault** — fetch secret name configured in settings; authenticate via Managed Identity or Service Principal |
| FR-1.24 | Support **AWS Secrets Manager** — fetch secret ARN configured in settings; authenticate via IAM role or `~/.aws/credentials`   |
| FR-1.25 | Secret manager URL and secret name/path stored in VS Code settings (non-sensitive); actual credentials never stored anywhere   |

#### Hard Prohibitions — Credential Safety

| ID      | Rule                                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1.26 | Credentials must **never** appear in `settings.json`, `launch.json`, `.vscode/`, or any tracked file                                     |
| FR-1.27 | Credentials must **never** be passed as parameters to MCP tool calls — they are resolved inside the MCP server process only              |
| FR-1.28 | Credentials must **never** be included in MCP tool responses, logs, error messages, or diagnostic output                                 |
| FR-1.29 | Credentials must **never** be sent to any GenAI agent, LLM API, or cloud service — the MCP server acts as a credential boundary          |
| FR-1.30 | Connection profile names stored in settings must contain only metadata (alias, host, port, service name, auth method) — never passwords  |
| FR-1.31 | The `.env` file template (`.env.example`) with placeholder values must be committed; the actual `.env` must be in `.gitignore`           |
| FR-1.32 | All credential lookups must be auditable — log which source resolved the credential (env var / wallet / vault) without logging the value |

---

### 4.2 Core Parsing & Analysis

`Priority: P0 — MVP`

| ID     | Requirement                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-2.1 | Fetch PL/SQL source from MCP server and parse all named objects: procedures, functions, packages (spec + body), triggers, types, sequences |
| FR-2.2 | Augment parsed call graph with dependency data fetched from `ALL_DEPENDENCIES` via MCP                                                     |
| FR-2.3 | Build a complete **call graph** and **dependency map** — direct and transitive — merging parsed source with live DB metadata               |
| FR-2.4 | Support Oracle DB versions: 11g, 12c, 19c, and 21c                                                                                         |
| FR-2.5 | Detect and explicitly flag **circular dependencies**                                                                                       |
| FR-2.6 | Handle real-world edge cases: wrapped packages, conditional compilation (`$IF`), and `DBMS_*` usage patterns                               |
| FR-2.7 | Cross-reference PL/SQL table access (DML targets) against schema tables fetched from MCP                                                   |

---

### 4.3 Code Quality Metrics

`Priority: P0 — MVP`

**Metrics — computed per-object and aggregated across the schema:**

| ID     | Metric                | Description                                                         |
| ------ | --------------------- | ------------------------------------------------------------------- |
| FR-3.1 | Cyclomatic Complexity | Decision-path count; flag objects exceeding configurable thresholds |
| FR-3.2 | Lines of Code         | Total, executable, and comment-to-code ratio                        |
| FR-3.3 | Code Duplication      | Clone detection across procedures and functions                     |
| FR-3.4 | Coupling Score        | Fan-in and fan-out count per object                                 |

**Code Smell Detection:**

| ID     | Smell                | Trigger                                              |
| ------ | -------------------- | ---------------------------------------------------- |
| FR-3.5 | Deep nesting         | Block depth exceeds configurable threshold           |
| FR-3.6 | Excessive parameters | Parameter count exceeds configurable threshold       |
| FR-3.7 | Overly long routines | Executable line count exceeds configurable threshold |
| FR-3.8 | Dead code            | Unreachable blocks or unused declared variables      |

> All rules and thresholds must be **fully configurable** per project or team profile via VS Code settings.

---

### 4.4 Security Analysis

`Priority: P0 — MVP`

| ID     | Vulnerability            | Detection Approach                                                        |
| ------ | ------------------------ | ------------------------------------------------------------------------- |
| FR-4.1 | SQL Injection            | Dynamic SQL built with unsanitized or concatenated user inputs            |
| FR-4.2 | Hardcoded Credentials    | String literals matching credential patterns (passwords, keys, tokens)    |
| FR-4.3 | Insecure Privilege Usage | `EXECUTE ANY`, wildcard or excessive `GRANT` statements (from MCP grants) |
| FR-4.4 | Exception Suppression    | Empty or catch-all `EXCEPTION WHEN OTHERS` blocks hiding security errors  |

---

### 4.5 Refactoring & Migration Guidance

`Priority: P1 — Phase 2`

| ID     | Requirement                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| FR-5.1 | Compute a **refactoring risk score** per object: `f(complexity, coupling, test coverage gap)`        |
| FR-5.2 | Rank all objects by risk score and present a prioritized backlog in the VS Code sidebar              |
| FR-5.3 | Suggest extracting duplicated logic into shared packages                                             |
| FR-5.4 | Flag deprecated PL/SQL syntax with modern replacement suggestions shown as Code Actions in VS Code   |
| FR-5.5 | Identify procedures safe for migration to application-layer code                                     |
| FR-5.6 | Produce a **migration readiness report** per package and module, viewable in a VS Code Webview panel |

---

### 4.6 Documentation Generation

`Priority: P1 — Phase 2`

Auto-generate structured documentation for every object, merging parsed source with MCP-fetched metadata.

| ID     | Field                      | Source                                                                   |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| FR-6.1 | Purpose / description      | Extracted from inline comments or inferred from code structure           |
| FR-6.2 | Parameters                 | Name, data type, and direction (`IN` / `OUT` / `IN OUT`)                 |
| FR-6.3 | Return type                | Applies to functions only                                                |
| FR-6.4 | Table dependencies         | DML targets cross-referenced against MCP-fetched table definitions       |
| FR-6.5 | Dependency cross-reference | Called-by and calls lists from both parsed source and `ALL_DEPENDENCIES` |
| FR-6.6 | Output formats             | VS Code hover tooltip, Webview panel, Markdown file, HTML, PDF           |

---

### 4.7 Reporting & Visualization

`Priority: P1 — Phase 2`

| ID     | Requirement                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------- |
| FR-7.1 | Generate **dependency graphs** at object-level and schema-level inside a VS Code Webview panel        |
| FR-7.2 | Export dependency graphs as SVG, PNG, or standalone interactive HTML                                  |
| FR-7.3 | Provide a **dashboard summary** Webview with trend indicators (improving / stable / degrading)        |
| FR-7.4 | Support audience-specific report templates: developer, architect, project manager, auditor            |
| FR-7.5 | All reports filterable by: object type, complexity range, schema/package name, and last-modified date |

---

## 5. Non-Functional Requirements

| ID    | Attribute      | Requirement                                                                                                                                                                       |
| ----- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | Scalability    | Handle schemas with 500,000+ lines of PL/SQL; support incremental re-analysis on changed objects only                                                                             |
| NFR-2 | Performance    | Full schema analysis must complete in under 5 minutes; incremental analysis under 30 seconds                                                                                      |
| NFR-3 | Cross-Platform | VS Code extension runs on Windows, macOS, and Linux                                                                                                                               |
| NFR-4 | Extensibility  | Plugin API for custom analysis rules and output formatters                                                                                                                        |
| NFR-5 | Data Privacy   | Source code and query results never leave the local environment; credentials resolved inside MCP server process only — never passed through tool calls, logs, or AI agent context |
| NFR-6 | Resilience     | Failure to fetch or parse any single object must log context and continue — never abort the full run                                                                              |
| NFR-7 | MCP Compliance | MCP server must conform to the Model Context Protocol specification for tool/resource discovery                                                                                   |

---

## 6. VS Code Extension Requirements

### 6.1 Extension UI & Panels

`Priority: P0 — MVP`

| ID     | Feature                  | Description                                                                         |
| ------ | ------------------------ | ----------------------------------------------------------------------------------- |
| UI-1.1 | Connection Manager       | Sidebar panel to add, edit, test, and switch Oracle connection profiles             |
| UI-1.2 | Schema Object Browser    | Tree view listing schemas → object types → individual objects, with icons per type  |
| UI-1.3 | Object Detail Panel      | Webview showing source, metrics, dependencies, and findings for the selected object |
| UI-1.4 | Dependency Graph Webview | Interactive, zoomable graph of object relationships rendered inside VS Code         |
| UI-1.5 | Findings Panel           | Problems-style panel listing all findings with severity, object, and line reference |
| UI-1.6 | Dashboard Webview        | Schema-level summary: total objects, quality score, top-risk objects, trend chart   |
| UI-1.7 | Refactoring Backlog      | Sidebar list of objects ranked by risk score with one-click navigation              |

### 6.2 Editor Integration

`Priority: P0 — MVP`

| ID     | Feature             | Description                                                                                        |
| ------ | ------------------- | -------------------------------------------------------------------------------------------------- |
| UI-2.1 | Inline Diagnostics  | Quality and security findings appear as VS Code Diagnostics (warnings/errors) in the editor gutter |
| UI-2.2 | Hover Documentation | Hovering over a procedure/function call shows generated doc, signature, and complexity score       |
| UI-2.3 | Code Lens           | Code Lens above each object header shows: complexity score, caller count, and risk level           |
| UI-2.4 | Code Actions        | Quick-fix and refactoring suggestions available via the VS Code lightbulb (Code Action) menu       |
| UI-2.5 | Go to Definition    | Navigate from a procedure call in PL/SQL source to its definition fetched from MCP                 |
| UI-2.6 | Find All References | Show all callers of a procedure/function using MCP `get_object_references`                         |

### 6.3 Commands & Keyboard Shortcuts

`Priority: P0 — MVP`

| ID     | Command                           | Default Shortcut | Description                                     |
| ------ | --------------------------------- | ---------------- | ----------------------------------------------- |
| UI-3.1 | `plsql-analyzer.connect`          | —                | Open connection manager and connect to database |
| UI-3.2 | `plsql-analyzer.analyzeSchema`    | `Ctrl+Shift+A`   | Run full schema analysis                        |
| UI-3.3 | `plsql-analyzer.analyzeObject`    | `Ctrl+Shift+O`   | Analyze the currently open or selected object   |
| UI-3.4 | `plsql-analyzer.showDependencies` | `Ctrl+Shift+D`   | Open dependency graph for the current object    |
| UI-3.5 | `plsql-analyzer.showDashboard`    | —                | Open schema quality dashboard                   |
| UI-3.6 | `plsql-analyzer.exportReport`     | —                | Export current analysis as HTML/PDF/Markdown    |
| UI-3.7 | `plsql-analyzer.refreshSchema`    | `Ctrl+Shift+R`   | Re-fetch schema metadata from MCP server        |

---

## 7. Integration Requirements

### 7.1 Version Control (Git)

`Priority: P1 — Phase 2`

| ID      | Requirement                                                                              |
| ------- | ---------------------------------------------------------------------------------------- |
| INT-1.1 | Compare analysis snapshots between commits to show how quality metrics shifted           |
| INT-1.2 | Generate trend charts for complexity, duplication, and security findings over time       |
| INT-1.3 | Support pre-commit hook mode to block commits that violate configured quality thresholds |

### 7.2 CI/CD Pipeline

`Priority: P1 — Phase 2`

| ID      | Requirement                                                                           |
| ------- | ------------------------------------------------------------------------------------- |
| INT-2.1 | Provide a CLI interface with machine-readable output in JSON and JUnit XML formats    |
| INT-2.2 | Return non-zero exit codes on threshold violations for fail-fast pipeline integration |
| INT-2.3 | Compatible with: GitHub Actions, GitLab CI, Jenkins, and Azure DevOps                 |

### 7.3 Automated Testing

`Priority: P2 — Phase 3`

| ID      | Requirement                                                                             |
| ------- | --------------------------------------------------------------------------------------- |
| INT-3.1 | Ingest test coverage data from utPLSQL or Quest Code Tester                             |
| INT-3.2 | Correlate coverage data with complexity metrics and surface gaps in VS Code diagnostics |
| INT-3.3 | Flag uncovered high-complexity objects as priority targets for new test creation        |

### 7.4 JIRA / Issue Tracking

`Priority: P2 — Phase 3`

| ID      | Requirement                                                                     |
| ------- | ------------------------------------------------------------------------------- |
| INT-4.1 | Connect to JIRA via REST API to fetch issues linked to named PL/SQL objects     |
| INT-4.2 | Automatically create or link JIRA issues from analysis findings                 |
| INT-4.3 | Display unified view in VS Code: Code Finding → JIRA Ticket → Resolution Status |

### 7.5 Historical Analysis

`Priority: P2 — Phase 3`

| ID      | Requirement                                                                   |
| ------- | ----------------------------------------------------------------------------- |
| INT-5.1 | Persist analysis snapshots to a local SQLite database after each run          |
| INT-5.2 | Support snapshot comparison queries viewable in a VS Code Webview             |
| INT-5.3 | Generate regression alerts when previously improving metrics begin to degrade |

---

## 8. Implementation Guidance

| #    | Principle                   | Requirement                                                                                                                                                                                                                                                                  |
| ---- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IG-1 | **Correctness first**       | Parser must handle Oracle PL/SQL edge cases correctly before expanding feature coverage                                                                                                                                                                                      |
| IG-2 | **MCP as source of truth**  | Always prefer live DB metadata from MCP over assumptions derived from local files alone                                                                                                                                                                                      |
| IG-3 | **Strict layer separation** | Decouple MCP Client, Parser, Analyzer, Storage, and VS Code UI — each independently testable and replaceable                                                                                                                                                                 |
| IG-4 | **Incremental processing**  | Re-fetch and re-analyze only objects that changed since the last snapshot                                                                                                                                                                                                    |
| IG-5 | **Explainable findings**    | Every finding must state: _what was detected_, _why it matters_, and _a concrete, actionable resolution_                                                                                                                                                                     |
| IG-6 | **Graceful degradation**    | Failure to fetch or parse any object must log full context and continue — never abort the full analysis run                                                                                                                                                                  |
| IG-7 | **VS Code API compliance**  | Use native VS Code APIs (Diagnostics, TreeView, Webview, SecretStorage, CodeLens) — do not replicate what VS Code provides                                                                                                                                                   |
| IG-8 | **Credential isolation**    | Credentials are resolved once inside the MCP server process at connection time and held in memory only. They must never flow into tool parameters, tool responses, log output, error messages, or any data accessible to GenAI agents. The MCP server is the trust boundary. |

---

## 9. Build Plan

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension                         │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Sidebar  │  │  Webview     │  │  Editor Integration  │   │
│  │ TreeView │  │  Panels      │  │  Diagnostics/Lens    │   │
│  └────┬─────┘  └──────┬───────┘  └──────────┬──────────┘   │
│       └───────────────┼──────────────────────┘              │
│              ┌────────▼────────┐                            │
│              │  Extension Host  │                            │
│              │  (TypeScript)    │                            │
│              └────────┬────────┘                            │
└───────────────────────┼─────────────────────────────────────┘
                        │ MCP Protocol (stdio / HTTP+SSE)
┌───────────────────────▼─────────────────────────────────────┐
│              Database MCP Server (Node.js)                   │
│  Tools: list_objects, get_object_source, get_dependencies…   │
│              └────────┬────────┘                            │
└───────────────────────┼─────────────────────────────────────┘
                        │ node-oracledb
              ┌─────────▼──────────┐
              │   Oracle Database   │
              │  (11g / 12c / 19c)  │
              └────────────────────┘
```

---

### Phase 0 — Foundation (Weeks 1–3)

**Goal:** MCP server operational and extension scaffold in place.

| #   | Task                                                                                                                                                 | Output                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0.1 | Scaffold Database MCP server using `@modelcontextprotocol/sdk` (Node.js)                                                                             | Runnable MCP server                                                      |
| 0.2 | Implement Oracle connectivity using `node-oracledb` with Instant Client support                                                                      | Connection tested against target DB                                      |
| 0.3 | Implement MCP tools: `list_schemas`, `list_objects`, `get_object_source`, `list_tables`, `get_table_detail`                                          | Core fetch tools working                                                 |
| 0.4 | Implement MCP tools: `get_object_dependencies`, `get_object_references`, `get_grants`, `get_invalid_objects`                                         | Dependency and security tools working                                    |
| 0.5 | Scaffold VS Code extension with TypeScript, `yo code` generator, and `esbuild` bundler                                                               | Extension loads in Extension Development Host                            |
| 0.6 | Implement MCP client inside extension host to connect to MCP server via stdio                                                                        | End-to-end: extension → MCP → Oracle                                     |
| 0.7 | Implement credential resolver in MCP server: env vars → `.env` → Oracle Wallet → external secret manager → VS Code SecretStorage (priority order)    | Credential resolution working with no plaintext exposure                 |
| 0.8 | Implement Connection Manager UI: sidebar panel showing profile alias, host, port — credentials entered once and stored via SecretStorage or env vars | Users can connect to Oracle from VS Code without credentials in settings |

**Exit criteria:** Extension connects to Oracle, fetches a schema object list, and displays it in the sidebar.

---

### Phase 1 — MVP Analysis (Weeks 4–7)

**Goal:** Core parsing, quality metrics, and security analysis visible inside VS Code.

| #    | Task                                                                                                        | Output                               |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1.1  | Integrate PL/SQL parser (ANTLR4 `plsql` grammar compiled to TypeScript target)                              | AST generated from fetched source    |
| 1.2  | Build Schema Object Browser TreeView: schemas → object types → named objects                                | Navigable tree in sidebar            |
| 1.3  | Implement call graph builder merging parsed AST with MCP `get_object_dependencies` data                     | Combined dependency model            |
| 1.4  | Implement cyclomatic complexity, LOC, coupling score, and code duplication metrics                          | Metrics available per object         |
| 1.5  | Implement code smell detectors (nesting, parameters, routine length, dead code)                             | Smell findings per object            |
| 1.6  | Implement security analyzers: SQL injection, hardcoded credentials, privilege misuse, exception suppression | Security findings per object         |
| 1.7  | Register findings as VS Code Diagnostics — visible in editor gutter and Problems panel                      | Inline warnings and errors           |
| 1.8  | Implement Code Lens showing complexity score, caller count, and risk level above each object header         | CodeLens annotations in editor       |
| 1.9  | Implement Hover provider showing signature, complexity, and summary doc for any object reference            | Hover tooltips                       |
| 1.10 | Implement `analyzeSchema` and `analyzeObject` commands with progress notification                           | Commands usable from Command Palette |

**Exit criteria:** Full schema analysis runs, findings appear as diagnostics in editor, Code Lens is visible, hover tooltips work.

---

### Phase 2 — Visualization & Documentation (Weeks 8–11)

**Goal:** Dependency graphs, documentation generation, refactoring guidance, and reporting.

| #    | Task                                                                                          | Output                       |
| ---- | --------------------------------------------------------------------------------------------- | ---------------------------- |
| 2.1  | Build Dependency Graph Webview using D3.js or Cytoscape.js inside a VS Code Webview panel     | Interactive graph in VS Code |
| 2.2  | Implement Go to Definition and Find All References using MCP `get_object_references`          | Navigation commands working  |
| 2.3  | Implement Code Actions (lightbulb menu) for refactoring suggestions                           | Quick-fix menu in editor     |
| 2.4  | Implement documentation generator producing hover tooltips, Webview docs, and Markdown export | Docs per object              |
| 2.5  | Cross-reference DML statements in PL/SQL against MCP-fetched table definitions                | Table access map per object  |
| 2.6  | Implement refactoring risk score calculator and Refactoring Backlog sidebar view              | Ranked backlog panel         |
| 2.7  | Build Dashboard Webview: schema quality summary with trend charts                             | Dashboard panel              |
| 2.8  | Implement report export: HTML, PDF (via Puppeteer), and Markdown                              | Export command working       |
| 2.9  | Implement incremental analysis: cache snapshots in SQLite, re-analyze only changed objects    | Fast incremental runs        |
| 2.10 | Implement configurable rules and thresholds via VS Code `settings.json` contribution points   | User-configurable thresholds |

**Exit criteria:** Dependency graph renders, docs appear in hover and Webview, refactoring backlog is visible, reports export correctly.

---

### Phase 3 — Integrations & Collaboration (Weeks 12–16)

**Goal:** Git trends, CI/CD CLI, test coverage, JIRA, and historical snapshots.

| #   | Task                                                                                          | Output                         |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| 3.1 | Build standalone CLI entry point (`plsql-analyzer` binary) wrapping the analysis engine       | CLI with JSON/XML output       |
| 3.2 | Implement Git integration: diff-based metric trend tracking between commits                   | Trend charts in Dashboard      |
| 3.3 | Implement pre-commit hook mode with threshold-based exit codes                                | CI/CD integration working      |
| 3.4 | Implement utPLSQL coverage ingestion and correlation with complexity metrics                  | Coverage-gap diagnostics       |
| 3.5 | Implement JIRA REST API integration: link findings to tickets and create issues from findings | JIRA panel in VS Code          |
| 3.6 | Implement historical snapshot comparison Webview                                              | Diff view across time          |
| 3.7 | Implement regression alerts for degrading metrics                                             | Alert notifications in VS Code |
| 3.8 | Implement collaboration features: inline comments and annotated export                        | Annotation support             |
| 3.9 | Package extension for VS Code Marketplace (`.vsix`) and publish                               | Extension published            |

**Exit criteria:** CLI works in GitHub Actions, JIRA integration links findings, historical diff view shows metric trends.

---

### Technology Stack

| Layer             | Technology                                   | Reason                                          |
| ----------------- | -------------------------------------------- | ----------------------------------------------- |
| VS Code Extension | TypeScript + VS Code Extension API           | Native IDE integration, full API access         |
| MCP Server        | Node.js + `@modelcontextprotocol/sdk`        | Official MCP SDK; stdio transport for local use |
| Oracle Driver     | `node-oracledb` (Thin mode)                  | No Oracle Client install required               |
| PL/SQL Parser     | ANTLR4 (`plsql` grammar) → TypeScript target | Handles full Oracle PL/SQL grammar              |
| Graph Rendering   | Cytoscape.js (inside VS Code Webview)        | Interactive graphs, no external dependencies    |
| Local Storage     | SQLite via `better-sqlite3`                  | Lightweight, local-only snapshot persistence    |
| Report Export     | Marked.js (Markdown) + Puppeteer (PDF)       | No server required for PDF generation           |
| Test Framework    | Mocha + `@vscode/test-electron`              | Official VS Code extension test framework       |
| Build Tool        | esbuild                                      | Fast bundling for extension and MCP server      |

---

## 10. Expected Deliverables

| ID  | Deliverable                | Description                                                                                                             |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| D1  | Architecture Diagram       | Component diagram showing VS Code Extension, MCP Server, Parser, Analyzer, Storage, and Oracle DB layers with data flow |
| D2  | MCP Server Implementation  | Fully functional Node.js MCP server with all tools and resources from section 4.1                                       |
| D3  | VS Code Extension Scaffold | TypeScript extension project with all commands, views, and providers registered                                         |
| D4  | PL/SQL Parser Integration  | ANTLR4-based parser producing AST from Oracle PL/SQL source with edge case coverage                                     |
| D5  | Analysis Engine            | Modular analyzers for quality metrics, code smells, security, and refactoring risk                                      |
| D6  | Data Model                 | SQLite schema for parsed objects, dependency graph, metrics, snapshots, and findings                                    |
| D7  | UI Components              | TreeView, Webview panels (graph, dashboard, docs), Code Lens, Diagnostics, Hover provider                               |
| D8  | CLI Entry Point            | Standalone CLI wrapping the analysis engine for CI/CD pipeline use                                                      |
| D9  | Implementation Roadmap     | Phase-by-phase delivery plan with scope, exit criteria, and dependency order per phase                                  |

---

_v1.4 — Added credential externalization strategy: env vars, `.env`, Oracle Wallet, Vault/Key Vault/Secrets Manager, VS Code SecretStorage; added hard prohibitions on credential exposure to GenAI agents and logs_
