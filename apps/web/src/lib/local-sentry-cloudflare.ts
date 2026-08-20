export function instrumentD1WithSentry<T>(binding: T) {
  return binding;
}

export function withSentry<T>(_config: () => Record<string, unknown>, app: T) {
  return app;
}
