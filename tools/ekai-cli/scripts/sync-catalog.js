const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const SOURCE_DIR = path.join(WORKSPACE_ROOT, 'model_catalog');
const DEST_DIR = path.join(__dirname, '..', 'catalog');
const FILES = [
  'chat_completions_providers_v1.json',
  'messages_providers_v1.json',
];

function copyFile(file) {
  const from = path.join(SOURCE_DIR, file);
  const to = path.join(DEST_DIR, file);
  if (!fs.existsSync(from)) {
    console.warn(`[sync-catalog] Warning: ${from} missing, skipping.`);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.warn('[sync-catalog] Warning: model_catalog directory not found.');
    return;
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  FILES.forEach(copyFile);
}

main();
