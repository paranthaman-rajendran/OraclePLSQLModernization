/**
 * Parameterized SQL constants for all MCP tool queries.
 * All queries use bind variables — never string interpolation.
 */

export const SQL = {
  // FR-1.1 list_schemas
  LIST_SCHEMAS_ALL: `
    SELECT username AS name,
           (SELECT COUNT(*) FROM all_objects o WHERE o.owner = u.username) AS object_count,
           TO_CHAR(created, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM all_users u
    ORDER BY username`,

  LIST_SCHEMAS_NON_SYSTEM: `
    SELECT username AS name,
           (SELECT COUNT(*) FROM all_objects o WHERE o.owner = u.username) AS object_count,
           TO_CHAR(created, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM all_users u
    WHERE username NOT IN (
      'SYS','SYSTEM','DBSNMP','SYSMAN','OUTLN','MDSYS','ORDSYS','EXFSYS',
      'DMSYS','WMSYS','CTXSYS','ANONYMOUS','XDB','ORDPLUGINS','ORDDATA',
      'SI_INFORMTN_SCHEMA','OLAPSYS','SCOTT','HR','OE','PM','IX','SH',
      'BI','APEX_PUBLIC_USER','FLOWS_FILES','APEX_040000','APEX_050000',
      'APEX_180100','APEX_190100','APEX_200100','APEX_210100'
    )
    ORDER BY username`,

  // FR-1.2 list_objects
  LIST_OBJECTS_ALL: `
    SELECT owner AS schema_name,
           object_name AS name,
           object_type AS type,
           status,
           TO_CHAR(last_ddl_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_ddl_time,
           0 AS source_lines
    FROM all_objects
    WHERE owner = :schema
    ORDER BY object_type, object_name`,

  LIST_OBJECTS_BY_TYPE: `
    SELECT owner AS schema_name,
           object_name AS name,
           object_type AS type,
           status,
           TO_CHAR(last_ddl_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_ddl_time,
           0 AS source_lines
    FROM all_objects
    WHERE owner = :schema
      AND object_type = :object_type
    ORDER BY object_name`,

  // FR-1.3 get_object_source
  GET_OBJECT_SOURCE: `
    SELECT text
    FROM all_source
    WHERE owner = :schema
      AND name = :name
      AND type = :type
    ORDER BY line`,

  // FR-1.4 get_package_spec (type = 'PACKAGE', body = 'PACKAGE BODY')
  GET_PACKAGE_SPEC: `
    SELECT text
    FROM all_source
    WHERE owner = :schema
      AND name = :name
      AND type = :type
    ORDER BY line`,

  // FR-1.5 get_object_dependencies (direct)
  GET_DEPENDENCIES_DIRECT: `
    SELECT owner AS from_schema,
           name AS from_name,
           type AS from_type,
           referenced_owner AS to_schema,
           referenced_name AS to_name,
           referenced_type AS to_type,
           referenced_link_name AS db_link
    FROM all_dependencies
    WHERE owner = :schema
      AND name = :name
      AND type = :type`,

  // FR-1.5 transitive dependencies (recursive CTE — Oracle 11g+)
  GET_DEPENDENCIES_TRANSITIVE: `
    WITH dep_tree (from_schema, from_name, from_type, to_schema, to_name, to_type, db_link, lvl) AS (
      SELECT owner, name, type, referenced_owner, referenced_name, referenced_type,
             referenced_link_name, 1
      FROM all_dependencies
      WHERE owner = :schema AND name = :name AND type = :type
      UNION ALL
      SELECT d.owner, d.name, d.type, d.referenced_owner, d.referenced_name, d.referenced_type,
             d.referenced_link_name, t.lvl + 1
      FROM all_dependencies d
      JOIN dep_tree t ON d.owner = t.to_schema AND d.name = t.to_name AND d.type = t.to_type
      WHERE t.lvl < 10
    )
    SELECT DISTINCT from_schema, from_name, from_type, to_schema, to_name, to_type, db_link
    FROM dep_tree`,

  // FR-1.6 get_object_references (reverse)
  GET_REFERENCES: `
    SELECT owner AS from_schema,
           name AS from_name,
           type AS from_type,
           referenced_owner AS to_schema,
           referenced_name AS to_name,
           referenced_type AS to_type,
           referenced_link_name AS db_link
    FROM all_dependencies
    WHERE referenced_owner = :schema
      AND referenced_name = :name
      AND referenced_type = :type`,

  // FR-1.7 list_tables
  LIST_TABLES: `
    SELECT t.owner AS schema_name,
           t.table_name AS name,
           (SELECT COUNT(*) FROM all_tab_columns c WHERE c.owner = t.owner AND c.table_name = t.table_name) AS column_count,
           com.comments
    FROM all_tables t
    LEFT JOIN all_tab_comments com ON com.owner = t.owner AND com.table_name = t.table_name
    WHERE t.owner = :schema
    ORDER BY t.table_name`,

  // FR-1.8 get_table_detail — columns
  GET_TABLE_COLUMNS: `
    SELECT column_name AS name,
           data_type || CASE
             WHEN data_type IN ('VARCHAR2','NVARCHAR2','CHAR') THEN '(' || data_length || ')'
             WHEN data_type = 'NUMBER' AND data_precision IS NOT NULL THEN '(' || data_precision || ',' || NVL(data_scale,0) || ')'
             ELSE ''
           END AS data_type,
           CASE nullable WHEN 'Y' THEN 1 ELSE 0 END AS nullable,
           data_default AS default_value
    FROM all_tab_columns
    WHERE owner = :schema AND table_name = :name
    ORDER BY column_id`,

  GET_TABLE_COMMENTS: `
    SELECT cc.column_name AS name, cc.comments
    FROM all_col_comments cc
    WHERE cc.owner = :schema AND cc.table_name = :name`,

  GET_TABLE_CONSTRAINTS: `
    SELECT c.constraint_name AS name,
           c.constraint_type,
           c.r_owner AS ref_schema,
           c.r_constraint_name,
           c.delete_rule,
           cc.column_name,
           cc.position
    FROM all_constraints c
    JOIN all_cons_columns cc ON cc.owner = c.owner AND cc.constraint_name = c.constraint_name
    WHERE c.owner = :schema AND c.table_name = :name
      AND c.constraint_type IN ('P','R','U')
    ORDER BY c.constraint_type, c.constraint_name, cc.position`,

  GET_TABLE_INDEXES: `
    SELECT i.index_name AS name,
           i.uniqueness,
           i.index_type AS type,
           ic.column_name,
           ic.column_position
    FROM all_indexes i
    JOIN all_ind_columns ic ON ic.index_owner = i.owner AND ic.index_name = i.index_name
    WHERE i.owner = :schema AND i.table_name = :name
    ORDER BY i.index_name, ic.column_position`,

  // FR-1.9 list_views
  LIST_VIEWS: `
    SELECT owner AS schema_name,
           view_name AS name,
           text
    FROM all_views
    WHERE owner = :schema
    ORDER BY view_name`,

  // FR-1.10 get_invalid_objects
  GET_INVALID_OBJECTS_ALL: `
    SELECT owner AS schema_name,
           object_name AS name,
           object_type AS type,
           status,
           TO_CHAR(last_ddl_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_ddl_time,
           0 AS source_lines
    FROM all_objects
    WHERE status != 'VALID'
    ORDER BY owner, object_type, object_name`,

  GET_INVALID_OBJECTS_BY_SCHEMA: `
    SELECT owner AS schema_name,
           object_name AS name,
           object_type AS type,
           status,
           TO_CHAR(last_ddl_time, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_ddl_time,
           0 AS source_lines
    FROM all_objects
    WHERE owner = :schema AND status != 'VALID'
    ORDER BY object_type, object_name`,

  // FR-1.11 get_grants — object grants
  GET_OBJECT_GRANTS: `
    SELECT grantee,
           owner,
           table_name AS object_name,
           privilege,
           CASE grantable WHEN 'YES' THEN 1 ELSE 0 END AS grantable,
           CASE hierarchy WHEN 'YES' THEN 1 ELSE 0 END AS hierarchy
    FROM all_tab_privs
    WHERE owner = :schema
    ORDER BY table_name, grantee, privilege`,

  // FR-1.11 system privileges
  GET_SYS_PRIVS: `
    SELECT grantee,
           privilege,
           CASE admin_option WHEN 'YES' THEN 1 ELSE 0 END AS admin_option
    FROM dba_sys_privs
    WHERE grantee IN (
      SELECT username FROM all_users WHERE username = :schema
    )
    ORDER BY privilege`,

  // FR-1.12 get_db_links
  GET_DB_LINKS: `
    SELECT owner,
           db_link AS name,
           host,
           username
    FROM all_db_links
    WHERE owner = :schema
    ORDER BY db_link`,

  GET_DB_LINKS_ALL: `
    SELECT owner,
           db_link AS name,
           host,
           username
    FROM all_db_links
    ORDER BY owner, db_link`,

  // FR-1.13 search_source
  SEARCH_SOURCE: `
    SELECT owner AS schema_name,
           name,
           type,
           line,
           text
    FROM all_source
    WHERE owner = :schema
      AND UPPER(text) LIKE UPPER(:query)
    ORDER BY owner, name, line
    FETCH FIRST :max_results ROWS ONLY`,

  SEARCH_SOURCE_ALL_SCHEMAS: `
    SELECT owner AS schema_name,
           name,
           type,
           line,
           text
    FROM all_source
    WHERE UPPER(text) LIKE UPPER(:query)
    ORDER BY owner, name, line
    FETCH FIRST :max_results ROWS ONLY`,

  // FR-1.14 get_compile_errors
  GET_COMPILE_ERRORS: `
    SELECT line,
           NVL(position, 1) AS col,
           attribute AS severity,
           text AS message,
           attribute
    FROM all_errors
    WHERE owner = :schema
      AND name = :name
      AND type = :type
    ORDER BY sequence`,

  // Count query for search_source (to set truncated flag)
  COUNT_SEARCH_SOURCE: `
    SELECT COUNT(*) AS cnt
    FROM all_source
    WHERE owner = :schema
      AND UPPER(text) LIKE UPPER(:query)`,
} as const;
