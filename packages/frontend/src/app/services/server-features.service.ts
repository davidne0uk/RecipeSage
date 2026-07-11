import { Injectable, inject, signal } from "@angular/core";

import { ServerActionsService } from "./server-actions.service";

/**
 * Server feature flags, fetched once at app start. The flags are deployment
 * config and only change when the api container restarts, so there is no
 * benefit to refetching them per page.
 *
 * Distinct from FeatureFlagService, which resolves build-time/hostname flags
 * synchronously. These come from the server at runtime, so they are async and
 * default to false until loaded - the UI must never offer an action the server
 * would refuse.
 */
@Injectable({
  providedIn: "root",
})
export class ServerFeaturesService {
  private serverActionsService = inject(ServerActionsService);

  communalRecipeLibrary = signal(false);

  async load() {
    const features = await this.serverActionsService.server.getServerFeatures({
      // Feature flags are an enhancement; a failure here must not block boot.
      // Leaving the defaults in place simply means no extra actions are offered.
      0: () => {},
    });
    if (!features) return;

    this.communalRecipeLibrary.set(features.communalRecipeLibrary);
  }
}
