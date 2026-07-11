import { Injectable } from "@angular/core";

import { ErrorHandlers } from "../http-error-handler.service";
import { ActionsBase, RouterOutputs } from "./actions-base";

/**
 * Server-level feature flags. These tell the client what the API will
 * authorize, so the UI can offer exactly that and no more.
 */
@Injectable({
  providedIn: "root",
})
export class ServerFeaturesActionsService extends ActionsBase {
  getServerFeatures(
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["server"]["getServerFeatures"] | undefined> {
    return this.passThrough(
      () => this.trpc.server.getServerFeatures.query(),
      errorHandlers,
    );
  }
}
