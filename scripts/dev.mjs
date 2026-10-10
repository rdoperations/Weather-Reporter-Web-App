// Starts the Python API (port 8000) and the Next.js dev server together.
// Usage: npm run dev:all        (set PYTHON=python3 etc. to pick another interpreter)
import { spawn, spawnSync } from "node:child_process";

const isWin = process.platform === "win32";
const python = process.env.PYTHON || (isWin ? "python" : "python3");

const children = [
  { name: "api", cmd: `${python} -m uvicorn api.index:app --port 8000` },
  { name: "web", cmd: "npx next dev" },
].map(({ name, cmd }) => {
  const child = spawn(cmd, { stdio: "inherit", shell: true });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[dev] ${name} exited (code ${code}); stopping the other process.`);
      shutdown(code ?? 1);
    }
  });
  return child;
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.pid) continue;
    // shell:true means the real server is a grandchild: kill the whole tree.
    // Synchronous on Windows: a fire-and-forget taskkill can lose the race with our own exit.
    if (isWin) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
