export type E2EGateEnv = {
  E2E_MODE?: string;
  ENVIRONMENT?: string;
};

export function isMarketingE2EAllowed(env: E2EGateEnv | undefined): boolean {
  return (
    env?.E2E_MODE === "true" &&
    (env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test")
  );
}
