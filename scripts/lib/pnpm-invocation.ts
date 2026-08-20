export interface CommandInvocation {
  executable: string;
  args: string[];
}

export function buildPnpmInvocation(
  args: string[],
  platform = process.platform,
  comspec = process.env.ComSpec,
): CommandInvocation {
  if (platform === "win32") {
    return {
      executable: comspec?.trim() || "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", ...args],
    };
  }

  return {
    executable: "pnpm",
    args,
  };
}
