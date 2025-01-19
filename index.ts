#!/usr/bin/env bun

import type { ChatResponse } from 'ollama';
import { Ollama } from 'ollama';
import { $ } from 'bun';

// remove the first two args from Bun.argv
const colors = {
  red: Bun.color('red', 'ansi')!,
  blue: Bun.color('blue', 'ansi')!,
  green: Bun.color('green', 'ansi')!,
  gray: Bun.color('gray', 'ansi')!,
  yellow: Bun.color('yellow', 'ansi')!,
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

if (Bun.argv.length <= 2) {
  console.log(colors.red + 'Invalid usage' + colors.reset);
  console.log(colors.bold + 'cmd-ollama <command>' + colors.reset);
  process.exit(1);
}

Bun.argv.splice(0, 2);
const userInput = Bun.argv.join(' ');

const ollama = new Ollama({ host: Bun.env.OLLAMA_API });
const models = await ollama.list();

if (!models.models.map((m) => m.name).includes('cmd:latest')) {
  const modelfile = `FROM llama3.2
# Set the temperature to 0.2 for more accurate and deterministic responses
PARAMETER temperature 0.2

# Define the system message to instruct the model to respond only with terminal commands
SYSTEM You are an AI tool designed to interact with a macOS terminal. Respond to all inputs with a single, concatenated terminal command, appropriate for macOS. Combine multiple commands using "&&". Do not include any explanations or additional text. Do not start or end the response with a grave accent. You will be given system info, use them only if you need them.
`;
  // @ts-ignore
  await ollama.create({ model: 'cmd', modelfile: modelfile });
}

const info = `=== STARTINFO ===\npwd: ${Bun.env.PWD}\nshell: ${Bun.env.SHELL}\npath: ${Bun.env.PATH}\n=== ENDINFO ===`;

const messages = [{ role: 'user', content: info + '\n' + userInput }];

while (true) {
  const response = (await ollama.chat({
    model: 'cmd',
    messages,
  })) as ChatResponse;
  const cmdToRun = response.message.content;
  messages.push({ role: 'assistant', content: cmdToRun });
  console.log(colors.green + '> ' + colors.blue + cmdToRun + colors.reset);
  const { stdout, stderr, exitCode } = await $`sh -c ${cmdToRun}`
    .nothrow()
    .quiet();

  if (stdout.toString().trim().length > 0)
    console.log(stdout.toString().trim());

  if (stderr.toString().trim().length > 0)
    console.log(colors.red + stderr.toString().trim() + colors.reset);

  if (exitCode !== 0) {
    messages.push({
      role: 'user',
      content:
        info +
        `\nThere was an error running the command:
stdout: ${stdout.toString()}
stderr: ${stderr.toString()}
exitCode: ${exitCode}
`,
    });
  } else break;
}
