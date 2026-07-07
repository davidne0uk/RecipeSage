import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const createLocation = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/createLocation",
      tags: ["pantry"],
      summary: "Create a pantry storage location",
      protect: true,
    },
  })
  .input(
    z.object({
      name: z.string().min(1).max(100),
    }),
  )
  .output(
    z.object({
      id: z.number(),
    }),
  )
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) => grocy.createLocation(input.name)),
  );
