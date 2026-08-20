import { describe, expect, it } from "vitest";
import { buildPnpmInvocation } from "./lib/pnpm-invocation";

describe("pnpm invocation", () => {
  it("uses cmd.exe for PNPM on Windows because Node cannot spawn .cmd directly", () => {
    expect(
      buildPnpmInvocation(
        ["--version"],
        "win32",
        "C:\\Windows\\System32\\cmd.exe",
      ),
    ).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "pnpm.cmd", "--version"],
    });
  });

  it("uses pnpm directly on non-Windows platforms", () => {
    expect(buildPnpmInvocation(["--version"], "linux")).toEqual({
      executable: "pnpm",
      args: ["--version"],
    });
  });
});
