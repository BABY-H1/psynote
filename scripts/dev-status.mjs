import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function print(line = '') {
  process.stdout.write(`${line}\n`);
}

async function checkUrl(label, url, parser = async (response) => response.text()) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const body = await parser(response);

    if (!response.ok) {
      print(`${label}: FAIL (${response.status}) ${url}`);
      return false;
    }

    print(`${label}: OK (${response.status}) ${url}`);
    if (body) {
      print(`  ${body}`);
    }
    return true;
  } catch (error) {
    print(`${label}: DOWN ${url}`);
    print(`  ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

print('Psynote local dev status');
print(`Root: ${root}`);
print(`Expected frontend: http://localhost:5173`);
print(`Expected backend:  http://localhost:4000`);

const packageJsonPath = path.join(root, 'package.json');
if (existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  print(`Package: ${packageJson.name ?? '(unknown)'}`);
}

const requiredPaths = [
  'client',
  'server',
  'server/.env',
];

for (const relativePath of requiredPaths) {
  const fullPath = path.join(root, relativePath);
  print(`${relativePath}: ${existsSync(fullPath) ? 'present' : 'missing'}`);
}

print();

const frontendOk = await checkUrl('Frontend', 'http://localhost:5173', async (response) => {
  const html = await response.text();
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  return titleMatch ? `title=${titleMatch[1]}` : 'HTML loaded';
});

const backendOk = await checkUrl('Backend', 'http://localhost:4000/api/health', async (response) => {
  const data = await response.json();
  return JSON.stringify(data);
});

print();
if (frontendOk && backendOk) {
  print('Result: local app looks healthy.');
} else {
  print('Result: one or more services are down.');
  print('Hint: run `npm run dev` from this project root, or start `npm run dev:client` / `npm run dev:server` separately.');
}
