import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createElement } from "react";
import {
  WeddingProvider,
  useActiveWedding,
} from "../../src/lib/wedding-context";

function Consumer() {
  const { activeWeddingId, setActiveWeddingId, setWeddingSwitchGuard } =
    useActiveWedding();
  return (
    <div>
      <span data-testid="id">{activeWeddingId ?? "none"}</span>
      <button onClick={() => setActiveWeddingId("wedding-1")}>Set</button>
      <button onClick={() => setWeddingSwitchGuard(() => false)}>Block</button>
      <button onClick={() => setWeddingSwitchGuard(null)}>Unblock</button>
    </div>
  );
}

function ThrowingConsumer() {
  useActiveWedding();
  return null;
}

describe("WeddingProvider + useActiveWedding", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("provides null activeWeddingId initially", () => {
    render(createElement(WeddingProvider, {}, createElement(Consumer)));
    expect(screen.getByTestId("id")).toHaveTextContent("none");
  });

  it("updates activeWeddingId when setActiveWeddingId is called", async () => {
    render(createElement(WeddingProvider, {}, createElement(Consumer)));
    await act(async () => {
      screen.getByRole("button", { name: "Set" }).click();
    });
    expect(screen.getByTestId("id")).toHaveTextContent("wedding-1");
  });

  it("blocks wedding switch when guard returns false", async () => {
    render(createElement(WeddingProvider, {}, createElement(Consumer)));

    await act(async () => {
      screen.getByRole("button", { name: "Block" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Set" }).click();
    });

    expect(screen.getByTestId("id")).toHaveTextContent("none");
  });

  it("allows wedding switch after guard is removed", async () => {
    render(createElement(WeddingProvider, {}, createElement(Consumer)));

    await act(async () => {
      screen.getByRole("button", { name: "Block" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Unblock" }).click();
    });
    await act(async () => {
      screen.getByRole("button", { name: "Set" }).click();
    });

    expect(screen.getByTestId("id")).toHaveTextContent("wedding-1");
  });

  it("persists activeWeddingId to sessionStorage when set", async () => {
    render(createElement(WeddingProvider, {}, createElement(Consumer)));
    await act(async () => {
      screen.getByRole("button", { name: "Set" }).click();
    });
    expect(sessionStorage.getItem("kaiplan:activeWeddingId")).toBe("wedding-1");
  });

  it("reads initial activeWeddingId from sessionStorage on mount", () => {
    sessionStorage.setItem("kaiplan:activeWeddingId", "persisted-wedding");
    render(createElement(WeddingProvider, {}, createElement(Consumer)));
    expect(screen.getByTestId("id")).toHaveTextContent("persisted-wedding");
  });

  it("removes activeWeddingId from sessionStorage when set to null", async () => {
    sessionStorage.setItem("kaiplan:activeWeddingId", "wedding-1");

    function NullConsumer() {
      const { setActiveWeddingId } = useActiveWedding();
      return <button onClick={() => setActiveWeddingId(null)}>Clear</button>;
    }

    render(createElement(WeddingProvider, {}, createElement(NullConsumer)));
    await act(async () => {
      screen.getByRole("button", { name: "Clear" }).click();
    });
    expect(sessionStorage.getItem("kaiplan:activeWeddingId")).toBeNull();
  });

  it("falls back to null when sessionStorage.getItem throws on init", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(createElement(WeddingProvider, {}, createElement(Consumer)));
    expect(screen.getByTestId("id")).toHaveTextContent("none");
    vi.restoreAllMocks();
  });

  it("ignores sessionStorage write errors when setting activeWeddingId", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(createElement(WeddingProvider, {}, createElement(Consumer)));
    await act(async () => {
      screen.getByRole("button", { name: "Set" }).click();
    });
    // Should not throw; state still updates
    expect(screen.getByTestId("id")).toHaveTextContent("wedding-1");
    vi.restoreAllMocks();
  });

  it("throws when useActiveWedding is used outside WeddingProvider", () => {
    const originalError = console.error;
    console.error = () => {};
    expect(() => render(createElement(ThrowingConsumer))).toThrow(
      "useActiveWedding must be used within WeddingProvider",
    );
    console.error = originalError;
  });
});
