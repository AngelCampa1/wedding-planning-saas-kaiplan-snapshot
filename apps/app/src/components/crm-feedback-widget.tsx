import { useEffect } from "react";

const DEFAULT_LOADER_URL = "https://widgets.ventoralabs.com/w/v1.js";

export function CrmFeedbackWidget() {
  const key = import.meta.env.VITE_CRM_WIDGET_KEY as string | undefined;
  const url =
    (import.meta.env.VITE_CRM_LOADER_URL as string | undefined) ||
    DEFAULT_LOADER_URL;

  useEffect(() => {
    if (!key) return;

    const sel = `script[data-product="${key}"][data-widget="feedback-button"]`;
    if (document.querySelector(sel)) return;

    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.setAttribute("data-product", key);
    s.setAttribute("data-widget", "feedback-button");
    document.body.appendChild(s);

    return () => {
      s.remove();
    };
  }, [key, url]);

  return null;
}
