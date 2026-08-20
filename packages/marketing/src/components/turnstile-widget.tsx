import { useEffect, useRef } from "react";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

interface TurnstileApi {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
  remove?: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  siteKey?: string;
  onToken: (token: string | null) => void;
  className?: string;
}

/**
 * Renders a managed Cloudflare Turnstile widget for the marketing forms.
 *
 * When no `siteKey` is configured (local dev), the widget renders nothing so
 * forms submit without a token and the server applies its dev bypass.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) return;

    // useEffect only runs after hydration in the browser, so `window` and
    // `document` are always available here — no SSR guard is needed.
    const renderContainer = containerRef.current!;
    let disposed = false;
    let loadedScript: HTMLScriptElement | null = null;
    let removeLoadListener:
      | { script: HTMLScriptElement; listener: () => void }
      | undefined;

    function renderWidget() {
      if (disposed || !renderContainer.isConnected) return;
      const turnstile = window.turnstile;
      if (!turnstile || widgetIdRef.current !== null) return;
      widgetIdRef.current = turnstile.render(renderContainer, {
        sitekey: siteKey as string,
        callback: (token: string) => {
          if (!disposed) onTokenRef.current(token);
        },
        "expired-callback": () => {
          if (!disposed) onTokenRef.current(null);
        },
        "error-callback": () => {
          if (!disposed) onTokenRef.current(null);
        },
      });
    }

    // Inject the Turnstile script once (idempotent — never double-inject).
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
      loadedScript = script;
    } else {
      existing.addEventListener("load", renderWidget);
      removeLoadListener = { script: existing, listener: renderWidget };
    }

    // If the API is already loaded, render immediately.
    if (window.turnstile) {
      renderWidget();
    }

    return () => {
      disposed = true;
      if (loadedScript?.onload === renderWidget) {
        loadedScript.onload = null;
      }
      if (removeLoadListener) {
        removeLoadListener.script.removeEventListener(
          "load",
          removeLoadListener.listener,
        );
      }
      const turnstile = window.turnstile;
      if (turnstile?.remove && widgetIdRef.current !== null) {
        turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      onTokenRef.current(null);
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return <div ref={containerRef} className={className} />;
}
