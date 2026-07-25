import { Component, Input, OnInit, inject, signal } from "@angular/core";
import { ActionSheetController } from "@ionic/angular/standalone";
import { TranslateService } from "@ngx-translate/core";

import { ServerActionsService } from "../../services/server-actions.service";
import type { RouterOutputs } from "../../services/server-actions/actions-base";
import { SHARED_UI_IMPORTS } from "../../providers/shared-ui.provider";
import {
  IonItem,
  IonIcon,
  IonLabel,
  IonBadge,
} from "@ionic/angular/standalone";
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  fileTrayStackedOutline,
} from "ionicons/icons";
import { addIcons } from "ionicons";

type IngredientAvailability =
  RouterOutputs["pantry"]["matchIngredients"][number];

/**
 * Shows "N of M in pantry" for a recipe with per-ingredient availability.
 * Renders nothing when the pantry feature is not configured, the pantry is
 * unreachable, or the recipe is not the viewer's own — availability is
 * advisory and must never break the recipe page.
 */
@Component({
  standalone: true,
  selector: "pantry-availability",
  templateUrl: "pantry-availability.component.html",
  styleUrls: ["pantry-availability.component.scss"],
  imports: [...SHARED_UI_IMPORTS, IonItem, IonIcon, IonLabel, IonBadge],
})
export class PantryAvailabilityComponent implements OnInit {
  actionSheetCtrl = inject(ActionSheetController);
  translate = inject(TranslateService);
  serverActionsService = inject(ServerActionsService);

  @Input({ required: true }) recipeId!: string;

  matches = signal<IngredientAvailability[] | null>(null);
  expanded = signal(false);

  constructor() {
    addIcons({
      alertCircleOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      fileTrayStackedOutline,
    });
  }

  ngOnInit() {
    void this.load();
  }

  private async load() {
    const silent = () => {};
    const result = await this.serverActionsService.pantry.matchIngredients(
      { recipeId: this.recipeId },
      { 412: silent, 404: silent, 500: silent, 0: silent },
    );
    if (result && result.length > 0) this.matches.set(result);
  }

  inStockCount(): number {
    return (this.matches() || []).filter((match) => match.inStock).length;
  }

  toggleExpanded() {
    this.expanded.set(!this.expanded());
  }

  iconFor(match: IngredientAvailability): string {
    if (!match.inStock) return "close-circle-outline";
    if (match.lowFill) return "alert-circle-outline";
    return "checkmark-circle-outline";
  }

  colorFor(match: IngredientAvailability): string {
    if (!match.inStock) return "medium";
    if (match.lowFill) return "warning";
    return "success";
  }

  isGuessedMatch(match: IngredientAvailability): boolean {
    return match.confidence === "llm";
  }

  async overrideMatch(match: IngredientAvailability) {
    const pantry = await this.serverActionsService.pantry.getPantry({
      412: () => {},
      500: () => {},
    });
    if (!pantry) return;

    const sheet = await this.actionSheetCtrl.create({
      header: this.translate.instant("components.pantryAvailability.linkItem", {
        ingredient: match.strippedName,
      }),
      buttons: [
        ...pantry.map((product) => ({
          text: product.name,
          handler: () => {
            void this.serverActionsService.pantry
              .setIngredientAlias({
                ingredientText: match.ingredient,
                grocyProductId: product.productId,
              })
              .then(() => this.load());
          },
        })),
        ...(match.productId !== null
          ? [
              {
                text: this.translate.instant(
                  "components.pantryAvailability.unlink",
                ),
                role: "destructive",
                handler: () => {
                  void this.serverActionsService.pantry
                    .setIngredientAlias({
                      ingredientText: match.ingredient,
                      grocyProductId: null,
                    })
                    .then(() => this.load());
                },
              },
            ]
          : []),
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
  }
}
