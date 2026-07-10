import { prisma, SessionDTO, sessionDTOSchema } from "@recipesage/prisma";
import { publicProcedure } from "../../trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  SessionType,
  generateSession,
  metrics,
  validatePasswordHash,
} from "@recipesage/util/server/general";

// A valid v2 pbkdf2 record for a random value, used to spend the same hashing
// time on absent / SSO-only accounts as on a real password check. Not a secret.
const DUMMY_PASSWORD_SALT =
  "4fSukwUhFE21d44ERezW/ZqOScEd1uqL4Yu8QHlto8qk7mmz7f9FCwG9mO2z1SANga4iwAVhMUiCVMRC3r0i8rjmw7t4X2nfGSpbuoZXGoYr/AOQJD+OBc7hSg4DKEe6nVVo6WGPlFktFJDvKcTdyTfR9l/mTVa5Ryfievi1hJA=";
const DUMMY_PASSWORD_HASH =
  "/vVrDoil9hKnv8eCOVpUCtDiQBkbH5T4h/ezUomOz3i2qr0zVWxYrn1vo6mCYFLpMBNMhgKA4kGPhK2zJdwglmRru4N0LvXkFtFzXrWyOa14/mYoBGA3h2B/eTT3dsNi19oDJirktqbKreNs0JtUL0y1LhgAOYXDRQkDtkCq4wb5t9jYYW/Hau+XETyjRhPzd5WKmUrQfN6Q1HpdLfKJofgOWVLUVDyZw6A7pCBA5sPrPDZmFETqU0escB8anBK0XeHxH7waH6o/PtgmpdJjzN01JJU2ZJ2OyAPV2svjnTAJ3ueaatatAgISIPXq2htTdWoG9R7tfSnq9ZQSL6zz5V+h7nH4vy6moH7cTZsZsB0jR0ajD0KeSvzVDS0OfDYxpdlZ/L65DSDo9h2T2fmq7Zfkd/CeEVXstgvtJdkxBFR9hHWJBxAznAQQroIIAztmER+CakAqu65uwzTTesLVXqSGwOE1oV7gEFqWobqDFEHRiYw01AbRU7it2T6VKFE3qJVKvQPBCYv7sub6DDpVtypT3o+aPHJNJDj7HYx2CmQSMK56qhsy+q7nrRJMzk6BmFw00q6SvNrXrA0WpaOXVAZfmTJbS+CXonlWDlGZx2+FJiXNwofDStwHg83Efzty60J6Olh/DSH8j2AtUIJvbGN0WM4tC0GBsGqGvnHm5gU=";

export const login = publicProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/users/login",
      tags: ["users"],
      summary:
        "Authenticate with email and password and receive a session token",
    },
  })
  .input(
    z.object({
      email: z.string(),
      password: z.string(),
    }),
  )
  .output(sessionDTOSchema)
  .mutation(async ({ input }) => {
    const user = await prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase(),
      },
    });

    // A single generic failure for "no such account" and "wrong password" so
    // an anonymous caller cannot enumerate registered emails by response.
    const invalidCredentials = new TRPCError({
      code: "UNAUTHORIZED",
      message: "The email or password provided is incorrect",
    });

    // Always run a hash comparison, even when the user is absent or is an SSO
    // account, so timing does not reveal which case occurred. DUMMY_PASSWORD_*
    // is a real v2 pbkdf2 record for a value no password can match.
    const passwordRecord =
      user?.passwordHash && user?.passwordSalt && user?.passwordVersion
        ? {
            passwordHash: user.passwordHash,
            passwordSalt: user.passwordSalt,
            passwordVersion: user.passwordVersion,
          }
        : {
            passwordHash: DUMMY_PASSWORD_HASH,
            passwordSalt: DUMMY_PASSWORD_SALT,
            passwordVersion: 2,
          };

    const isPasswordValid = await validatePasswordHash(
      input.password,
      passwordRecord,
    );

    const hasPassword =
      !!user?.passwordHash && !!user?.passwordSalt && !!user?.passwordVersion;
    if (!user || !hasPassword || !isPasswordValid) {
      throw invalidCredentials;
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        lastLogin: new Date(),
      },
    });

    const session = await generateSession(user.id, SessionType.User);

    metrics.userLogin.inc({
      auth_type: "password",
    });

    return {
      token: session.token,
      userId: session.userId,
      email: user.email,
    } satisfies SessionDTO;
  });
