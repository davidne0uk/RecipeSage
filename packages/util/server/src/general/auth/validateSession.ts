import { Session } from "@recipesage/prisma";
import { prisma } from "@recipesage/prisma";

export async function validateSession(
  token: string,
): Promise<Session | undefined> {
  const session = await prisma.session.findUnique({
    where: {
      token,
    },
  });

  if (!session) return undefined;

  // An expired session is treated as absent, so every caller's existing
  // "not authenticated" handling applies unchanged.
  if (session.expires < new Date()) return undefined;

  return session;
}
