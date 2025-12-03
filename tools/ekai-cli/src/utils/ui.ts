import * as readline from 'readline';
import { c } from './colors';

export function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

export async function selectModelInteractive(toolName: string): Promise<string> {
  const apiType = toolName === 'claude' ? 'messages API' : 'chat completions API';
  
  // Show only the specified popular models
  const popularModels = toolName === 'codex' 
    ? ['gpt-5', 'gpt-4o-mini', 'gemini-2.5-flash', 'grok-code-fast-1', 'z-ai/glm-4.6', 'deepseek/deepseek-v3.2-special']
    : ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5', 'glm-4.6', 'grok-code-fast-1'];

  const choices = [...popularModels, 'Type custom model name...'];
  let selectedIndex = 0;
  
  console.log(`${c.cyan}?${c.reset} Select a model (${apiType}):`);
  
  // Hide cursor
  process.stdout.write('\x1B[?25l');

  const render = () => {
    choices.forEach((choice, i) => {
      const isSelected = i === selectedIndex;
      const pointer = isSelected ? `${c.cyan}❯${c.reset}` : ' ';
      const style = isSelected ? `${c.cyan}${c.bright}` : c.dim;
      const suffix = c.reset;
      
      // Clear the line and print
      process.stdout.write('\x1B[2K\r'); 
      console.log(`  ${pointer} ${style}${choice}${suffix}`);
    });
  };

  // Initial render
  render();

  return new Promise<string>((resolve) => {
    const cleanup = () => {
      process.stdout.write('\x1B[?25h'); // Show cursor
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeAllListeners('keypress');
    };

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    process.stdin.on('keypress', async (_, key) => {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      // Up arrow
      if (key && key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        // Move cursor up N lines
        process.stdout.write(`\x1B[${choices.length}A`);
        render();
      } 
      // Down arrow
      else if (key && key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % choices.length;
        process.stdout.write(`\x1B[${choices.length}A`);
        render();
      } 
      // Enter
      else if (key && key.name === 'return') {
        // Clear the list before showing result for a cleaner look
        process.stdout.write(`\x1B[${choices.length}A`); // Move to start of list
        process.stdout.write('\x1B[0J'); // Clear screen from cursor down
        
        cleanup();
        
        const selected = choices[selectedIndex];
        if (selected === 'Type custom model name...') {
          const customModel = await prompt(`${c.cyan}?${c.reset} Enter model name: `);
          resolve(customModel);
        } else {
          resolve(selected);
        }
      }
    });
  });
}
