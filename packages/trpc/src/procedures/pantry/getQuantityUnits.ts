import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const getQuantityUnits = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/pantry/getQuantityUnits",
      tags: ["pantry"],
      summary: "Get all pantry quantity units",
      protect: true,
    },
  })
  .output(
    z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        namePlural: z.string(),
      }),
    ),
  )
  .query(async () => grocyTrpc(async (grocy) => grocy.getQuantityUnits()));
