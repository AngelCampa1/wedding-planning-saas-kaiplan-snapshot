/**
 * E2E bypass gate — fail-closed implementation.
 *
 * The E2E bypass is permitted ONLY when both conditions are true:
 *   1. E2E_MODE === "true"
 *   2. ENVIRONMENT is explicitly "development" or "test"
 *
 * An unset ENVIRONMENT value must never silently enable the bypass. If
 * ENVIRONMENT is undefined or any other value (e.g. "production"), the gate
 * returns false and the real production code-path runs.
 */

type E2eGateEnv = {
  E2E_MODE?: string;
  ENVIRONMENT?: string;
};

/**
 * Returns true only when the E2E bypass is explicitly permitted: E2E_MODE is
 * "true" AND ENVIRONMENT is "development" or "test". Any other combination
 * (including an unset ENVIRONMENT) evaluates to false.
 */
export function isE2eAllowed(env: E2eGateEnv): boolean {
  return (
    env.E2E_MODE === "true" &&
    (env.ENVIRONMENT === "development" || env.ENVIRONMENT === "test")
  );
}
