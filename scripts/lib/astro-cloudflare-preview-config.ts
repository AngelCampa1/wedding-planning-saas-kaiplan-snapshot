export interface WranglerPreviewConfig {
  pages_build_output_dir?: string;
  assets?: {
    binding?: string;
    directory?: string;
  };
  [key: string]: unknown;
}

export function normalizeAstroCloudflarePreviewConfig(
  config: WranglerPreviewConfig,
): WranglerPreviewConfig {
  if (config.assets?.binding !== "ASSETS") {
    return config;
  }

  const { pages_build_output_dir: _pagesBuildOutputDir, ...workerConfig } =
    config;

  return workerConfig;
}
