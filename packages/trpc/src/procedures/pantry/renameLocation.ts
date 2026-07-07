import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const renameLocation = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/renameLocation",
      tags: ["pantry"],
      summary: "Rename a pantry storage location",
      protect: true,
    },
  })
  .input(
    z.object({
      locationId: z.number().int().positive(),
      name: z.string().min(1).max(100),
    }),
  )
  .output(z.void())
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) =>
      grocy.updateLocation(input.locationId, input.name),
    ),
  );
