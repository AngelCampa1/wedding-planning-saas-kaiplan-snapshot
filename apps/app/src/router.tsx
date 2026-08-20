import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface AuthContext {
  isAuthenticated: boolean;
  user: { id: string; name: string; email: string } | null;
}

export const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: false,
      user: null,
    },
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
