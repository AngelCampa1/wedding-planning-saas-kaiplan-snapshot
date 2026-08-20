import { expect, type Page } from "@playwright/test";

type Failure = {
  source: "console" | "response";
  message: string;
};

type DiagnosticsOptions = {
  ignoreConsole?: RegExp[];
  ignoreResponses?: RegExp[];
};

const defaultIgnoredConsolePatterns = [
  /Failed to load resource: the server responded with a status of 403 \(\)/,
];

const defaultIgnoredResponsePatterns: RegExp[] = [];

function matchesAny(patterns: RegExp[] | undefined, value: string) {
  return patterns?.some((pattern) => pattern.test(value)) ?? false;
}

export function installPageDiagnostics(
  page: Page,
  options: DiagnosticsOptions = {},
) {
  const failures: Failure[] = [];
  const ignoreConsole = [
    ...defaultIgnoredConsolePatterns,
    ...(options.ignoreConsole ?? []),
  ];
  const ignoreResponses = [
    ...defaultIgnoredResponsePatterns,
    ...(options.ignoreResponses ?? []),
  ];

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    const text = message.text();
    if (matchesAny(ignoreConsole, text)) {
      return;
    }

    failures.push({
      source: "console",
      message: text,
    });
  });

  page.on("response", (response) => {
    if (response.status() < 400) {
      return;
    }

    const detail = `${response.status()} ${response.url()}`;
    if (matchesAny(ignoreResponses, detail)) {
      return;
    }

    failures.push({
      source: "response",
      message: detail,
    });
  });

  return {
    failures,
    expectNoFailures() {
      expect(
        failures,
        failures.length === 0
          ? "expected no console or network failures"
          : failures
              .map((failure) => `${failure.source}: ${failure.message}`)
              .join("\n"),
      ).toEqual([]);
    },
  };
}
