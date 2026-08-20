import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCapturedFeedback,
  createNoopEmailService,
  getCapturedFeedback,
} from "../../src/lib/email";
import { feedbackRoutes } from "../../src/routes/feedback";
import { RateLimiter } from "../../src/lib/rate-limit";
import type { Auth } from "../../src/auth";

const BASE_ENV = {
  FEEDBACK_RECIPIENT_EMAIL: "operator@ventoralabs.com",
  EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
};

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

function makeAuth(
  sessionResult: { user: typeof TEST_USER; session: object } | null,
): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(sessionResult),
    },
  } as unknown as Auth;
}

function makeAuthenticatedAuth(): Auth {
  return makeAuth({ user: TEST_USER, session: {} });
}

function makeUnauthenticatedAuth(): Auth {
  return makeAuth(null);
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeMalformedJsonRequest() {
  return new Request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"message":',
  });
}

// ---------------------------------------------------------------------------
// Minimal DO namespace backed by a real RateLimiter instance
// ---------------------------------------------------------------------------
class MemStorage {
  private store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

function makeNamespace(limiter?: RateLimiter): DurableObjectNamespace {
  const storage = new MemStorage() as unknown as DurableObjectStorage;
  const doInstance =
    limiter ?? new RateLimiter({ storage } as unknown as DurableObjectState);
  const stub = {
    fetch: (req: Request) => doInstance.fetch(req),
  } as unknown as DurableObjectStub;
  return {
    idFromName: (_name: string) =>
      ({ toString: () => _name }) as DurableObjectId,
    get: (_id: DurableObjectId) => stub,
    newUniqueId: () => ({ toString: () => "unique" }) as DurableObjectId,
    jurisdiction: () => ({}) as DurableObjectNamespace,
  } as unknown as DurableObjectNamespace;
}

describe("feedbackRoutes - POST /", () => {
  beforeEach(() => {
    clearCapturedFeedback();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  describe("authentication guard", () => {
    it("returns 401 when no session exists and does not send email", async () => {
      const mockService = {
        sendFeedback: vi.fn().mockResolvedValue(undefined),
        sendPasswordReset: vi.fn(),
        sendMemberInvite: vi.fn(),
        sendRsvpConfirmation: vi.fn(),
        sendRsvpReminder: vi.fn(),
      };
      const app = feedbackRoutes(mockService, makeUnauthenticatedAuth());
      const res = await app.request(
        "/",
        makeRequest({ message: "This should be blocked" }),
        BASE_ENV,
      );
      expect(res.status).toBe(401);
      expect(mockService.sendFeedback).not.toHaveBeenCalled();
    });

    it("returns 401 body with Unauthorized message", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeUnauthenticatedAuth(),
      );
      const res = await app.request(
        "/",
        makeRequest({ message: "blocked" }),
        BASE_ENV,
      );
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("authenticated requests", () => {
    it("returns 200 with ok:true for a valid message", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const res = await app.request(
        "/",
        makeRequest({ message: "This app is great!" }),
        BASE_ENV,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it("captures feedback to the FEEDBACK_RECIPIENT_EMAIL", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      await app.request(
        "/",
        makeRequest({ message: "Great feature!", email: "user@example.com" }),
        BASE_ENV,
      );
      const captured = getCapturedFeedback();
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({
        message: "Great feature!",
        email: "user@example.com",
      });
    });

    it("returns 400 with error shape when message is empty", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const res = await app.request(
        "/",
        makeRequest({ message: "" }),
        BASE_ENV,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { fieldErrors: Record<string, string[]> };
      };
      expect(body.error).toBeDefined();
      expect(body.error.fieldErrors.message).toBeDefined();
    });

    it("returns 400 for malformed JSON instead of throwing", async () => {
      const mockService = {
        sendFeedback: vi.fn().mockResolvedValue(undefined),
        sendPasswordReset: vi.fn(),
        sendMemberInvite: vi.fn(),
        sendRsvpConfirmation: vi.fn(),
        sendRsvpReminder: vi.fn(),
      };
      const app = feedbackRoutes(mockService, makeAuthenticatedAuth());

      const res = await app.request("/", makeMalformedJsonRequest(), BASE_ENV);

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({
        error: "Malformed JSON request body",
      });
      expect(mockService.sendFeedback).not.toHaveBeenCalled();
    });

    it("returns 400 for an invalid email", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const res = await app.request(
        "/",
        makeRequest({ message: "Hello", email: "not-an-email" }),
        BASE_ENV,
      );
      expect(res.status).toBe(400);
    });

    it("returns 200 when no email is provided", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const res = await app.request(
        "/",
        makeRequest({ message: "Just a note" }),
        BASE_ENV,
      );
      expect(res.status).toBe(200);
      const captured = getCapturedFeedback();
      expect(captured[0].email).toBeUndefined();
    });

    it("forwards pageUrl from the request body", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      await app.request(
        "/",
        makeRequest({
          message: "Test with page",
          pageUrl: "https://app.kaiplan.test/dashboard",
        }),
        BASE_ENV,
      );
      expect(getCapturedFeedback()[0].pageUrl).toBe(
        "https://app.kaiplan.test/dashboard",
      );
    });

    it("calls emailService.sendFeedback with the parsed data", async () => {
      const mockService = {
        sendFeedback: vi.fn().mockResolvedValue(undefined),
        sendPasswordReset: vi.fn(),
        sendMemberInvite: vi.fn(),
        sendRsvpConfirmation: vi.fn(),
        sendRsvpReminder: vi.fn(),
      };
      const app = feedbackRoutes(mockService, makeAuthenticatedAuth());
      await app.request(
        "/",
        makeRequest({ message: "Hello!", email: "u@example.com" }),
        BASE_ENV,
      );
      expect(mockService.sendFeedback).toHaveBeenCalledWith({
        message: "Hello!",
        email: "u@example.com",
        pageUrl: undefined,
      });
    });

    it("trims optional email and pageUrl before sending feedback", async () => {
      const mockService = {
        sendFeedback: vi.fn().mockResolvedValue(undefined),
        sendPasswordReset: vi.fn(),
        sendMemberInvite: vi.fn(),
        sendRsvpConfirmation: vi.fn(),
        sendRsvpReminder: vi.fn(),
      };
      const app = feedbackRoutes(mockService, makeAuthenticatedAuth());

      const res = await app.request(
        "/",
        makeRequest({
          message: "Hello!",
          email: "  u@example.com  ",
          pageUrl: "  https://app.kaiplan.test/dashboard  ",
        }),
        BASE_ENV,
      );

      expect(res.status).toBe(200);
      expect(mockService.sendFeedback).toHaveBeenCalledWith({
        message: "Hello!",
        email: "u@example.com",
        pageUrl: "https://app.kaiplan.test/dashboard",
      });
    });
  });

  describe("DO-backed rate limiting", () => {
    it("passes through all requests when RATE_LIMITER binding is absent (no-op)", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      // 12 requests — all should succeed because no RATE_LIMITER binding
      for (let i = 0; i < 12; i++) {
        const res = await app.request(
          "/",
          makeRequest({ message: `Feedback ${i + 1}` }),
          BASE_ENV,
        );
        expect(res.status).toBe(200);
      }
    });

    it("returns 429 when DO rate limit is exceeded (limit=10/min per userId)", async () => {
      const ns = makeNamespace();
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const envWithRateLimiter = { ...BASE_ENV, RATE_LIMITER: ns };

      // Exhaust limit (10 requests)
      for (let i = 0; i < 10; i++) {
        const res = await app.request(
          "/",
          makeRequest({ message: `Feedback ${i + 1}` }),
          envWithRateLimiter,
        );
        expect(res.status).toBe(200);
      }

      // 11th should be blocked
      const res = await app.request(
        "/",
        makeRequest({ message: "One too many" }),
        envWithRateLimiter,
      );
      expect(res.status).toBe(429);
    });

    it("returns 429 body with rate limit message", async () => {
      const ns = makeNamespace();
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const envWithRateLimiter = { ...BASE_ENV, RATE_LIMITER: ns };

      for (let i = 0; i < 10; i++) {
        await app.request(
          "/",
          makeRequest({ message: `Feedback ${i + 1}` }),
          envWithRateLimiter,
        );
      }
      const res = await app.request(
        "/",
        makeRequest({ message: "blocked" }),
        envWithRateLimiter,
      );
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/rate limit/i);
    });

    it("does not send email when rate limited", async () => {
      const mockService = {
        sendFeedback: vi.fn().mockResolvedValue(undefined),
        sendPasswordReset: vi.fn(),
        sendMemberInvite: vi.fn(),
        sendRsvpConfirmation: vi.fn(),
        sendRsvpReminder: vi.fn(),
      };
      const ns = makeNamespace();
      const app = feedbackRoutes(mockService, makeAuthenticatedAuth());
      const envWithRateLimiter = { ...BASE_ENV, RATE_LIMITER: ns };

      for (let i = 0; i < 10; i++) {
        await app.request(
          "/",
          makeRequest({ message: `Feedback ${i + 1}` }),
          envWithRateLimiter,
        );
      }
      mockService.sendFeedback.mockClear();
      await app.request(
        "/",
        makeRequest({ message: "blocked" }),
        envWithRateLimiter,
      );
      expect(mockService.sendFeedback).not.toHaveBeenCalled();
    });

    it("tracks rate limits independently per userId (separate namespaces)", async () => {
      // Two separate DO namespaces = two independent users' rate limit buckets
      const nsA = makeNamespace();
      const nsB = makeNamespace();

      const userA = {
        id: "user-a",
        email: "a@example.com",
        name: "User A",
        emailVerified: true,
      };
      const userB = {
        id: "user-b",
        email: "b@example.com",
        name: "User B",
        emailVerified: true,
      };

      const authA: Auth = {
        api: {
          getSession: vi.fn().mockResolvedValue({ user: userA, session: {} }),
        },
      } as unknown as Auth;
      const authB: Auth = {
        api: {
          getSession: vi.fn().mockResolvedValue({ user: userB, session: {} }),
        },
      } as unknown as Auth;

      const appA = feedbackRoutes(createNoopEmailService(), authA);
      const appB = feedbackRoutes(createNoopEmailService(), authB);
      const envA = { ...BASE_ENV, RATE_LIMITER: nsA };
      const envB = { ...BASE_ENV, RATE_LIMITER: nsB };

      // Exhaust user A's limit
      for (let i = 0; i < 10; i++) {
        await appA.request("/", makeRequest({ message: `A ${i}` }), envA);
      }

      // User A is now rate-limited
      const resA = await appA.request(
        "/",
        makeRequest({ message: "A blocked" }),
        envA,
      );
      expect(resA.status).toBe(429);

      // User B has independent namespace — still allowed
      const resB = await appB.request(
        "/",
        makeRequest({ message: "B ok" }),
        envB,
      );
      expect(resB.status).toBe(200);
    });

    it("keys rate limit by userId (same namespace, same user = shared bucket)", async () => {
      // Single namespace, same user ID → both instances share the same bucket
      const ns = makeNamespace();
      const userA = {
        id: "user-shared",
        email: "a@example.com",
        name: "A",
        emailVerified: true,
      };
      const authA: Auth = {
        api: {
          getSession: vi.fn().mockResolvedValue({ user: userA, session: {} }),
        },
      } as unknown as Auth;
      const app = feedbackRoutes(createNoopEmailService(), authA);
      const env = { ...BASE_ENV, RATE_LIMITER: ns };

      // Exhaust all 10 requests
      for (let i = 0; i < 10; i++) {
        await app.request("/", makeRequest({ message: `msg ${i}` }), env);
      }
      // 11th blocked
      const res = await app.request(
        "/",
        makeRequest({ message: "blocked" }),
        env,
      );
      expect(res.status).toBe(429);
    });

    it("passes through when RATE_LIMITER binding is missing (no-op guard)", async () => {
      const app = feedbackRoutes(
        createNoopEmailService(),
        makeAuthenticatedAuth(),
      );
      const res = await app.request(
        "/",
        makeRequest({ message: "test" }),
        BASE_ENV, // no RATE_LIMITER → no-op
      );
      expect(res.status).toBe(200);
    });
  });
});
