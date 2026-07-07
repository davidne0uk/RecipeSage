import { TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/node";
import {
  getGrocyClient,
  GrocyClient,
  GrocyNotConfiguredError,
  GrocyRequestError,
  GrocyUnavailableError,
} from "@recipesage/util/server/general";

export const PANTRY_NOT_CONFIGURED_MESSAGE =
  "Pantry features are not configured on this server";
export const PANTRY_UNAVAILABLE_MESSAGE =
  "The pantry service is currently unavailable";

/**
 * Runs a pantry operation against Grocy, translating Grocy failure modes into
 * typed TRPC errors so the rest of the app is unaffected when Grocy is
 * missing or down.
 */
export const grocyTrpc = async <T>(
  fn: (grocy: GrocyClient) => Promise<T>,
): Promise<T> => {
  let grocy: GrocyClient;
  try {
    grocy = getGrocyClient();
  } catch (e) {
    if (e instanceof GrocyNotConfiguredError) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: PANTRY_NOT_CONFIGURED_MESSAGE,
      });
    }
    throw e;
  }

  try {
    return await fn(grocy);
  } catch (e) {
    if (e instanceof GrocyUnavailableError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: PANTRY_UNAVAILABLE_MESSAGE,
      });
    }
    if (e instanceof GrocyRequestError) {
      Sentry.captureException(e);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: PANTRY_UNAVAILABLE_MESSAGE,
      });
    }
    throw e;
  }
};
