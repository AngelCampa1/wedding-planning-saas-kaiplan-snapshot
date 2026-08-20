export interface ProdEnv {
  prod: boolean;
  apiUrl: string | undefined;
  publicSiteUrl: string | undefined;
  sentryDsn: string | undefined;
}

export function assertProdEnv(
  env: ProdEnv = {
    prod: import.meta.env.PROD,
    apiUrl: import.meta.env.VITE_API_URL,
    publicSiteUrl: import.meta.env.VITE_PUBLIC_SITE_URL,
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  },
): void {
  if (!env.prod) {
    return;
  }

  if (!env.apiUrl) {
    throw new Error("VITE_API_URL is required in production");
  }

  if (!env.publicSiteUrl) {
    throw new Error("VITE_PUBLIC_SITE_URL is required in production");
  }

  if (!env.sentryDsn) {
    throw new Error("VITE_SENTRY_DSN is required in production");
  }
}
