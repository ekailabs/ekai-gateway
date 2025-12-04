export const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const symbols = {
  check: `${c.green}✔${c.reset}`,
  cross: `${c.red}✖${c.reset}`,
  info: `${c.blue}ℹ${c.reset}`,
  arrow: `${c.cyan}➜${c.reset}`,
  warning: `${c.yellow}⚠${c.reset}`,
};

