import { spawn } from "node:child_process";

export function isDockerSandboxEnabled(
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  return source.ORBITA_SANDBOX_DOCKER === "1";
}

export async function dockerRunEcho(text: string): Promise<{ output: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "docker",
      ["run", "--rm", "--network=none", "alpine:3.20", "echo", text],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ output: stdout.trim() });
        return;
      }
      reject(new Error(stderr.trim() || `docker exited with code ${code}`));
    });
  });
}
