/**
 * `plsql-analyze init` — scaffolds a .plsql-analyzer.json config file.
 */

import * as fs from 'fs';
import * as path from 'path';

const TEMPLATE = {
  host: 'localhost',
  port: 1521,
  serviceName: 'ORCL',
  username: 'YOUR_SCHEMA',
  schema: 'YOUR_SCHEMA',
  format: 'text',
  failOn: 'error',
  rules: {
    maxComplexityWarning: 10,
    maxComplexityError: 20,
    maxNestingDepth: 4,
    maxParameterCount: 7,
    maxRoutineLines: 200,
  },
  _note: 'Set PLSQL_PASSWORD env var — do NOT store passwords in this file',
};

export async function writeConfigTemplate(opts: { force?: boolean }): Promise<void> {
  const filePath = path.join(process.cwd(), '.plsql-analyzer.json');

  if (fs.existsSync(filePath) && !opts.force) {
    console.error(`.plsql-analyzer.json already exists. Use --force to overwrite.`);
    process.exit(2);
  }

  fs.writeFileSync(filePath, JSON.stringify(TEMPLATE, null, 2) + '\n', 'utf-8');
  console.log(`✓ Created ${filePath}`);
  console.log('  Edit the file and set PLSQL_PASSWORD in your environment or .env (gitignored).');

  // Suggest adding .env to .gitignore
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.env')) {
      fs.appendFileSync(gitignorePath, '\n# plsql-analyze credentials\n.env\n');
      console.log('  Added .env to .gitignore');
    }
  }
}
