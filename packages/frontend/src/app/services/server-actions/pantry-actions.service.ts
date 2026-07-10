import { Injectable } from "@angular/core";

import { ErrorHandlers } from "../http-error-handler.service";
import { ActionsBase, RouterInputs, RouterOutputs } from "./actions-base";

/**
 * Pantry stock lives in Grocy on the local network and is never cached in
 * the local offline database, so all actions are simple passthroughs.
 *
 * Error statuses of note for callers: 412 (pantry not configured on this
 * server) and 500 (Grocy unreachable) — pages should render dedicated states
 * for these instead of the default alert.
 */
@Injectable({
  providedIn: "root",
})
export class PantryActionsService extends ActionsBase {
  getPantry(
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["getPantry"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.getPantry.query(),
      errorHandlers,
    );
  }

  getQuantityUnits(
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["getQuantityUnits"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.getQuantityUnits.query(),
      errorHandlers,
    );
  }

  addStock(
    input: RouterInputs["pantry"]["addStock"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["addStock"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.addStock.mutate(input),
      errorHandlers,
    );
  }

  consumeStock(
    input: RouterInputs["pantry"]["consumeStock"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["consumeStock"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.consumeStock.mutate(input),
      errorHandlers,
    );
  }

  setFillLevel(
    input: RouterInputs["pantry"]["setFillLevel"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["setFillLevel"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.setFillLevel.mutate(input),
      errorHandlers,
    );
  }

  resolveBarcode(
    input: RouterInputs["pantry"]["resolveBarcode"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["resolveBarcode"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.resolveBarcode.query(input),
      errorHandlers,
    );
  }

  createProduct(
    input: RouterInputs["pantry"]["createProduct"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["createProduct"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.createProduct.mutate(input),
      errorHandlers,
    );
  }

  identifyProductPhoto(
    input: RouterInputs["pantry"]["identifyProductPhoto"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["identifyProductPhoto"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.identifyProductPhoto.mutate(input),
      errorHandlers,
    );
  }

  estimateFillLevel(
    input: RouterInputs["pantry"]["estimateFillLevel"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["estimateFillLevel"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.estimateFillLevel.mutate(input),
      errorHandlers,
    );
  }

  matchIngredients(
    input: RouterInputs["pantry"]["matchIngredients"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["matchIngredients"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.matchIngredients.query(input),
      errorHandlers,
    );
  }

  setIngredientAlias(
    input: RouterInputs["pantry"]["setIngredientAlias"],
    errorHandlers?: ErrorHandlers,
  ): Promise<RouterOutputs["pantry"]["setIngredientAlias"] | undefined> {
    return this.passThrough(
      () => this.trpc.pantry.setIngredientAlias.mutate(input),
      errorHandlers,
    );
  }
}
