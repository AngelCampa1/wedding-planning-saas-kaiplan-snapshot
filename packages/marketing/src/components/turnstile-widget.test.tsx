import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TurnstileWidget } from "./turnstile-widget";

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface RenderOptions {
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  sitekey?: string;
}

function getScripts(): HTMLScriptElement[] {
  return Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    ),
  );
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete (window as { turnstile?: unknown }).turnstile;
});

afterEach(() => {
  cleanup();
});

describe("TurnstileWidget", () => {
  it("renders nothing when no siteKey is provided", () => {
    const onToken = vi.fn();
    const { container } = render(<TurnstileWidget onToken={onToken} />);
    expect(container.firstChild).toBeNull();
    expect(getScripts()).toHaveLength(0);
  });

  it("renders nothing when siteKey is an empty string", () => {
    const onToken = vi.fn();
    const { container } = render(
      <TurnstileWidget siteKey="" onToken={onToken} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("injects the Turnstile script once and renders the widget when turnstile is already available", () => {
    const onToken = vi.fn();
    let captured: RenderOptions | null = null;
    const render_ = vi.fn((_el: HTMLElement, opts: RenderOptions) => {
      captured = opts;
      return "widget-id-1";
    });
    const remove = vi.fn();
    (window as { turnstile?: unknown }).turnstile = { render: render_, remove };

    const { container } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );

    // Container div is rendered.
    expect(container.firstChild).not.toBeNull();
    // Script is injected exactly once.
    expect(getScripts()).toHaveLength(1);
    // Widget rendered with the site key.
    expect(render_).toHaveBeenCalledTimes(1);
    expect(captured).not.toBeNull();
    const opts = captured as unknown as RenderOptions;
    expect(opts.sitekey).toBe("site-key-1");

    // Solve forwards the token.
    opts.callback?.("solved-token");
    expect(onToken).toHaveBeenCalledWith("solved-token");

    // Expiry and error reset the token to null.
    opts["expired-callback"]?.();
    expect(onToken).toHaveBeenCalledWith(null);
    onToken.mockClear();
    opts["error-callback"]?.();
    expect(onToken).toHaveBeenCalledWith(null);
  });

  it("does not double-inject the script when one already exists", () => {
    const existing = document.createElement("script");
    existing.src = TURNSTILE_SCRIPT_SRC;
    document.head.appendChild(existing);

    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn(() => "id"),
      remove: vi.fn(),
    };

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site-key-1" onToken={onToken} />);

    expect(getScripts()).toHaveLength(1);
  });

  it("renders the widget once the script onload fires when turnstile was not yet available", () => {
    const onToken = vi.fn();
    const { container } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );

    // No turnstile yet, so render is deferred; script is injected.
    const scripts = getScripts();
    expect(scripts).toHaveLength(1);
    expect(container.querySelector("div")).not.toBeNull();

    // Make turnstile available and fire the load event.
    const render_ = vi.fn(() => "widget-id");
    (window as { turnstile?: unknown }).turnstile = {
      render: render_,
      remove: vi.fn(),
    };
    const script = scripts[0];
    expect(script).toBeDefined();
    script?.onload?.(new Event("load"));

    expect(render_).toHaveBeenCalledTimes(1);
  });

  it("removes the widget on unmount when turnstile.remove is available", () => {
    const remove = vi.fn();
    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn(() => "widget-id-9"),
      remove,
    };

    const onToken = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );

    unmount();
    expect(remove).toHaveBeenCalledWith("widget-id-9");
  });

  it("renders via load listener when an unloaded script tag already exists", () => {
    const existing = document.createElement("script");
    existing.src = TURNSTILE_SCRIPT_SRC;
    document.head.appendChild(existing);

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site-key-1" onToken={onToken} />);

    // turnstile not yet available; rendering is deferred to the load event.
    const render_ = vi.fn(() => "widget-from-existing");
    (window as { turnstile?: unknown }).turnstile = {
      render: render_,
      remove: vi.fn(),
    };
    existing.dispatchEvent(new Event("load"));

    expect(render_).toHaveBeenCalledTimes(1);
    expect(getScripts()).toHaveLength(1);
  });

  it("does not render twice if the load event fires after an immediate render", () => {
    const render_ = vi.fn(() => "widget-id");
    (window as { turnstile?: unknown }).turnstile = {
      render: render_,
      remove: vi.fn(),
    };

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site-key-1" onToken={onToken} />);
    // Immediate render already happened.
    expect(render_).toHaveBeenCalledTimes(1);

    // A late onload firing must not render a second widget (widgetId guard).
    const scripts = getScripts();
    scripts[0]?.onload?.(new Event("load"));
    expect(render_).toHaveBeenCalledTimes(1);
  });

  it("does not render when turnstile becomes unavailable before load fires", () => {
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="site-key-1" onToken={onToken} />);
    const scripts = getScripts();
    // No window.turnstile set — the load handler must no-op safely.
    expect(() => scripts[0]?.onload?.(new Event("load"))).not.toThrow();
  });

  it("unmounts cleanly when turnstile.remove is not available", () => {
    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn(() => "widget-id"),
    };
    const onToken = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );
    expect(() => unmount()).not.toThrow();
  });

  it("skips remove on unmount when no widget was ever rendered", () => {
    const remove = vi.fn();
    const onToken = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );
    // turnstile only becomes available after mount, so no widget id was stored.
    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn(() => "late"),
      remove,
    };
    unmount();
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not render after unmount when a newly injected script loads late", () => {
    const onToken = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );
    const script = getScripts()[0];

    unmount();

    const render_ = vi.fn(() => "late-widget");
    (window as { turnstile?: unknown }).turnstile = {
      render: render_,
      remove: vi.fn(),
    };
    script?.onload?.(new Event("load"));

    expect(render_).not.toHaveBeenCalled();
  });

  it("removes the load listener for an existing script on unmount", () => {
    const existing = document.createElement("script");
    existing.src = TURNSTILE_SCRIPT_SRC;
    document.head.appendChild(existing);

    const onToken = vi.fn();
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key-1" onToken={onToken} />,
    );

    unmount();

    const render_ = vi.fn(() => "late-widget");
    (window as { turnstile?: unknown }).turnstile = {
      render: render_,
      remove: vi.fn(),
    };
    existing.dispatchEvent(new Event("load"));

    expect(render_).not.toHaveBeenCalled();
  });

  it("re-renders the widget when the siteKey changes", () => {
    const render_ = vi
      .fn()
      .mockReturnValueOnce("id-a")
      .mockReturnValueOnce("id-b");
    const remove = vi.fn();
    (window as { turnstile?: unknown }).turnstile = {
      render: render_,
      remove,
    };
    const onToken = vi.fn();
    const { rerender } = render(
      <TurnstileWidget siteKey="key-a" onToken={onToken} />,
    );
    expect(render_).toHaveBeenCalledTimes(1);
    const firstOptions = render_.mock.calls[0]?.[1] as RenderOptions;
    firstOptions.callback?.("stale-token");
    expect(onToken).toHaveBeenCalledWith("stale-token");

    rerender(<TurnstileWidget siteKey="key-b" onToken={onToken} />);
    // Old widget removed, new one rendered.
    expect(remove).toHaveBeenCalledWith("id-a");
    expect(onToken).toHaveBeenCalledWith(null);
    expect(render_).toHaveBeenCalledTimes(2);
    expect(render_.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ sitekey: "key-b" }),
    );

    onToken.mockClear();
    firstOptions.callback?.("stale-token-after-rerender");
    firstOptions["expired-callback"]?.();
    firstOptions["error-callback"]?.();
    expect(onToken).not.toHaveBeenCalled();
  });

  it("applies the provided className to the container", () => {
    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn(() => "id"),
      remove: vi.fn(),
    };
    const onToken = vi.fn();
    const { container } = render(
      <TurnstileWidget
        siteKey="site-key-1"
        onToken={onToken}
        className="my-class"
      />,
    );
    expect(container.querySelector(".my-class")).not.toBeNull();
  });
});
