import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files = files.concat(walk(full));
    else if (full.endsWith('.js')) files.push(full);
  }
  return files;
}

const apiFiles = walk('app/api');
let errors = 0;
for (const file of apiFiles) {
  try {
    execSync(`node --check "${file}"`);
  } catch (err) {
    console.error('Syntax error in:', file);
    errors++;
  }
}
console.log(`Checked ${apiFiles.length} API files. Syntax errors: ${errors}`);
if (errors > 0) process.exit(1);
