import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const pythonFromVenv = isWindows
  ? join(root, "backend", ".venv", "Scripts", "python.exe")
  : join(root, "backend", ".venv", "bin", "python");
const python = existsSync(pythonFromVenv) ? pythonFromVenv : "python";

const processes = [
  {
    name: "backend",
    command: python,
    args: ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
    cwd: join(root, "backend"),
    shell: false
  },
  {
    name: "frontend",
    command: npm,
    args: ["--prefix", "frontend", "run", "dev"],
    cwd: root,
    shell: isWindows
  }
];

const children = processes.map(({ name, command, args, cwd, shell }) => {
  const child = spawn(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell,
    env: {
      ...process.env,
      BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8000"
    }
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(prefixOutput(name, chunk));
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(prefixOutput(name, chunk));
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] stopped by ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function prefixOutput(name, chunk) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line, index, lines) => {
      if (!line && index === lines.length - 1) return "";
      return `[${name}] ${line}`;
    })
    .join("\n");
}
