import {readFileSync} from 'node:fs';

// The UI modules share one scope in the browser through imports; tests run them as one script
// with imports removed, supplying model, bridge and DOM stubs through the VM context.
const modules = ['state.js', 'components.js', 'views.js', 'app.js'];

export function uiSource() {
  return modules.map(name => readFileSync(new URL(`../app/src/main/assets/ui/${name}`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export (?=(const|let|function|async function)\b)/gm, '')).join('\n');
}
