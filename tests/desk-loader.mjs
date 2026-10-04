// Resolve this Next.js project's aliases for direct service integration tests.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
registerHooks({
 resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server' || specifier === 'next/headers') specifier += '.js';
  let target;
  if (specifier.startsWith('@/')) target = path.join(root, specifier.slice(2));
  else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if (target && path.extname(target) && existsSync(target)) return {url:pathToFileURL(target).href,shortCircuit:true};
  if (target && !path.extname(target) && existsSync(target+'.js')) return {url:pathToFileURL(target+'.js').href,shortCircuit:true};
  return nextResolve(specifier, context);
 },
 load(url, context, nextLoad) {
  if (url.startsWith(pathToFileURL(root).href+'/') && url.endsWith('.js') && !url.includes('/node_modules/')) return {format:'module',source:readFileSync(fileURLToPath(url),'utf8'),shortCircuit:true};
  return nextLoad(url,context);
 }
});
