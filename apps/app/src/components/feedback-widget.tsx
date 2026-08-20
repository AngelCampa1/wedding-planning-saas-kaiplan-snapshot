import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { apiFetch } from "../lib/api";

const feedbackResponseSchema = z.object({
  ok: z.boolean(),
});

type SubmitStatus = "idle" | "success" | "error";

export function FeedbackWidget() {
  const session = useSession();
  const userEmail = session?.data?.user?.email ?? "";

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(userEmail);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [validationError, setValidationError] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const sessionEmail = session?.data?.user?.email ?? null;
  useEffect(() => {
    if (sessionEmail && !open) {
      setEmail(sessionEmail);
    }
  }, [sessionEmail, open]);

  function handleOpen(value: boolean) {
    setOpen(value);
    if (value) {
      setEmail(session?.data?.user?.email ?? "");
      setMessage("");
      setStatus("idle");
      setValidationError("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setValidationError("Message is required");
      return;
    }
    setValidationError("");
    setSubmitting(true);
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          message,
          email: email || undefined,
          pageUrl: window.location.href,
        }),
        schema: feedbackResponseSchema,
      });
      setStatus("success");
      timeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 2000);
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-50 size-12 rounded-full shadow-floating p-0"
        onClick={() => handleOpen(true)}
      >
        <MessageCircle className="size-5" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
          </DialogHeader>

          {status === "success" ? (
            <p className="text-sm text-success">
              Thanks — we&apos;ll get back to you.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feedback-message">Message</Label>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what you think…"
                  rows={4}
                />
                {validationError && (
                  <p className="text-sm text-destructive">{validationError}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feedback-email">
                  Your email{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="feedback-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">
                  Something went wrong. Please try again.
                </p>
              )}

              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Send feedback"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
