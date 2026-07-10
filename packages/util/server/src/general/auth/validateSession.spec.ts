import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@recipesage/prisma", () => ({
  prisma: {
    session: {
      findUnique,
    },
  },
}));

import { validateSession } from "./validateSession";

const buildSession = (expires: Date) => ({
  id: "session-id",
  userId: "user-id",
  type: "user",
  token: "token",
  expires,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

describe("validateSession", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("returns the session when it has not expired", async () => {
    const session = buildSession(daysFromNow(30));
    findUnique.mockResolvedValue(session);

    expect(await validateSession("token")).toEqual(session);
  });

  it("returns undefined when no session matches the token", async () => {
    findUnique.mockResolvedValue(null);

    expect(await validateSession("token")).toBeUndefined();
  });

  it("returns undefined when the session has expired", async () => {
    findUnique.mockResolvedValue(buildSession(daysFromNow(-1)));

    expect(await validateSession("token")).toBeUndefined();
  });

  it("returns undefined when the session expired moments ago", async () => {
    findUnique.mockResolvedValue(buildSession(new Date(Date.now() - 1000)));

    expect(await validateSession("token")).toBeUndefined();
  });
});
