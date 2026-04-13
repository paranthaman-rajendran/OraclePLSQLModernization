import { executeQuery } from '../oracle/connection.js';
import { SQL } from '../oracle/queries.js';
import type { GetGrantsInput, GetGrantsOutput } from '@plsql-analyzer/shared';

interface GrantRow {
  GRANTEE: string; OWNER: string; OBJECT_NAME: string;
  PRIVILEGE: string; GRANTABLE: number; HIERARCHY: number;
}
interface SysPrivRow { GRANTEE: string; PRIVILEGE: string; ADMIN_OPTION: number }

export async function getGrants(input: GetGrantsInput): Promise<GetGrantsOutput> {
  const [grantRows, sysRows] = await Promise.all([
    executeQuery<GrantRow>(input.connectionId, SQL.GET_OBJECT_GRANTS, {
      schema: input.schema.toUpperCase(),
    }),
    executeQuery<SysPrivRow>(input.connectionId, SQL.GET_SYS_PRIVS, {
      schema: input.schema.toUpperCase(),
    }).catch(() => [] as SysPrivRow[]), // dba_sys_privs may be inaccessible
  ]);

  return {
    objectGrants: grantRows.map(r => ({
      grantee: r.GRANTEE,
      owner: r.OWNER,
      objectName: r.OBJECT_NAME,
      privilege: r.PRIVILEGE,
      grantable: r.GRANTABLE === 1,
      hierarchy: r.HIERARCHY === 1,
    })),
    systemPrivileges: sysRows.map(r => ({
      grantee: r.GRANTEE,
      privilege: r.PRIVILEGE,
      adminOption: r.ADMIN_OPTION === 1,
    })),
  };
}
