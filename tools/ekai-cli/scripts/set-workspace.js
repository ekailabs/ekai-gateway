const fs = require('fs');
const path = require('path');
const os = require('os');

const workspaceArg = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const CLI_CONFIG_DIR = path.join(os.homedir(), '.ekai');
const CLI_CONFIG_PATH = path.join(CLI_CONFIG_DIR, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CLI_CONFIG_PATH)) return {};
  try {
    const raw = fs.readFileSync(CLI_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.warn(`[ekai-cli] Warning: unable to parse ${CLI_CONFIG_PATH}: ${err.message}`);
  }
  return {};
}

function saveConfig(config) {
  fs.mkdirSync(CLI_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CLI_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function main() {
  const config = loadConfig();
  config.workspacePath = workspaceArg;
  saveConfig(config);
  console.log(`[ekai-cli] Workspace set to ${workspaceArg}`);
}

main();
