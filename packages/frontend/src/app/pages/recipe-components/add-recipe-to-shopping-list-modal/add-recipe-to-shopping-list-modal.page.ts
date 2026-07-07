import {
  Component,
  EffectRef,
  Injector,
  Input,
  effect,
  inject,
} from "@angular/core";
import {
  NavController,
  ToastController,
  ModalController,
  AlertController,
} from "@ionic/angular/standalone";
import { TranslateService } from "@ngx-translate/core";

import { LoadingService } from "../../../services/loading.service";
import { UtilService } from "../../../services/util.service";
import { NewShoppingListModalPage } from "../../shopping-list-components/new-shopping-list-modal/new-shopping-list-modal.page";
import { SHARED_UI_IMPORTS } from "../../../providers/shared-ui.provider";
import { SelectIngredientsComponent } from "../../../components/select-ingredients/select-ingredients.component";
import { ServerActionsService } from "../../../services/server-actions.service";
import type { RecipeSummary, ShoppingListSummary } from "@recipesage/prisma";
import {
  SHOPPING_LIST_ITEMS_TITLE_LENGTH_LIMIT,
  ParsedIngredient,
  stripIngredient,
} from "@recipesage/util/shared";
import { TRPCService } from "../../../services/trpc.service";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonLabel,
  IonFooter,
} from "@ionic/angular/standalone";
import { closeOutline, listOutline } from "ionicons/icons";
import { addIcons } from "ionicons";

@Component({
  standalone: true,
  selector: "page-add-recipe-to-shopping-list-modal",
  templateUrl: "add-recipe-to-shopping-list-modal.page.html",
  styleUrls: ["add-recipe-to-shopping-list-modal.page.scss"],
  imports: [
    ...SHARED_UI_IMPORTS,
    SelectIngredientsComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonLabel,
    IonFooter,
  ],
})
export class AddRecipeToShoppingListModalPage {
  navCtrl = inject(NavController);
  translate = inject(TranslateService);
  loadingService = inject(LoadingService);
  utilService = inject(UtilService);
  toastCtrl = inject(ToastController);
  alertCtrl = inject(AlertController);
  modalCtrl = inject(ModalController);
  serverActionsService = inject(ServerActionsService);
  private trpcService = inject(TRPCService);
  private injector = inject(Injector);

  @Input({
    required: true,
  })
  recipes!: Pick<RecipeSummary, "id" | "title" | "ingredients">[];
  @Input() scale: string = "1";
  selectedIngredientsByRecipe: { [key: string]: ParsedIngredient[] } = {};
  selectedIngredients: ParsedIngredient[] = [];

  private shoppingListsQuery =
    this.serverActionsService.shoppingLists.getShoppingLists();
  shoppingLists?: ShoppingListSummary[];

  destinationShoppingList?: ShoppingListSummary;

  saving = false;

  constructor() {
    addIcons({ closeOutline, listOutline });
    effect(() => {
      const lists = this.shoppingListsQuery.value();
      if (!lists) return;
      this.shoppingLists = [...lists].sort((a, b) =>
        a.title.localeCompare(b.title),
      );
      if (!this.destinationShoppingList) this.selectLastUsedShoppingList();
    });
  }

  ionViewWillEnter() {
    this.shoppingListsQuery.refresh();
  }

  selectLastUsedShoppingList() {
    if (!this.shoppingLists) return;

    const lastUsedShoppingListId = localStorage.getItem(
      "lastUsedShoppingListId",
    );
    this.destinationShoppingList = this.shoppingLists.find(
      (el) => el.id === lastUsedShoppingListId,
    );
  }

  saveLastUsedShoppingList() {
    if (!this.destinationShoppingList) return;

    localStorage.setItem(
      "lastUsedShoppingListId",
      this.destinationShoppingList.id,
    );
  }

  selectedIngredientsChange(
    recipeId: string,
    selectedIngredients: ParsedIngredient[],
  ) {
    this.selectedIngredientsByRecipe[recipeId] = selectedIngredients;

    this.selectedIngredients = Object.values(
      this.selectedIngredientsByRecipe,
    ).flat();
  }

  isFormValid() {
    if (!this.destinationShoppingList) return false;

    return this.selectedIngredients && this.selectedIngredients.length > 0;
  }

  async save() {
    if (this.saving) return;
    if (!this.destinationShoppingList) return;

    this.saving = true;
    const loading = this.loadingService.start();

    this.saveLastUsedShoppingList();

    const items = Object.entries(this.selectedIngredientsByRecipe)
      .map(([recipeId, ingredients]) =>
        (ingredients as ParsedIngredient[]).map((ingredient) => ({
          title: ingredient.plaintextContent
            .trim()
            .slice(0, SHOPPING_LIST_ITEMS_TITLE_LENGTH_LIMIT),
          recipeId,
        })),
      )
      .flat()
      .filter((item) => item.title.length > 0);

    if (items.length === 0) {
      this.saving = false;
      loading.dismiss();
      this.modalCtrl.dismiss();
      return;
    }

    const response =
      await this.serverActionsService.shoppingLists.createShoppingListItems({
        shoppingListId: this.destinationShoppingList.id,
        items,
      });

    if (response) {
      await this.markItemsAlreadyInPantry(
        this.destinationShoppingList.id,
        Object.keys(this.selectedIngredientsByRecipe),
      );
    }

    this.saving = false;
    loading.dismiss();
    if (!response) return;

    this.modalCtrl.dismiss();
  }

  /**
   * Marks freshly added items that are already in pantry stock as completed
   * (snapshot at add-time). Visible-but-precompleted rather than omitted, so
   * the user can un-complete to shop for them anyway. Never blocks the save:
   * any pantry error (not configured, unreachable) silently skips this step.
   */
  private async markItemsAlreadyInPantry(
    shoppingListId: string,
    recipeIds: string[],
  ): Promise<void> {
    try {
      const silent = () => {};
      const handlers = { 412: silent, 404: silent, 500: silent, 0: silent };

      const ownedNames = new Set<string>();
      for (const recipeId of recipeIds) {
        const matches = await this.serverActionsService.pantry.matchIngredients(
          { recipeId },
          handlers,
        );
        for (const match of matches || []) {
          if (match.inStock) {
            ownedNames.add(match.strippedName.toLowerCase());
          }
        }
      }
      if (ownedNames.size === 0) return;

      const listItems =
        await this.trpcService.trpc.shoppingLists.getShoppingListItems
          .query({ shoppingListId })
          .catch(() => undefined);
      if (!listItems) return;

      const recipeIdSet = new Set(recipeIds);
      const itemsToComplete = listItems.filter(
        (item) =>
          !item.completed &&
          item.recipeId &&
          recipeIdSet.has(item.recipeId) &&
          ownedNames.has(stripIngredient(item.title).toLowerCase()),
      );
      if (itemsToComplete.length === 0) return;

      await this.serverActionsService.shoppingLists.updateShoppingListItems({
        shoppingListId,
        items: itemsToComplete.map((item) => ({
          id: item.id,
          completed: true,
        })),
      });

      const message = await this.translate
        .get("pages.addRecipeToShoppingListModal.alreadyHave", {
          count: itemsToComplete.length,
        })
        .toPromise();
      const toast = await this.toastCtrl.create({
        message,
        duration: 5000,
      });
      await toast.present();
    } catch (e) {
      // Advisory only — never block adding to the shopping list
      console.warn("Pantry pre-completion skipped", e);
    }
  }

  async createShoppingList() {
    const message = await this.translate
      .get("pages.addRecipeToShoppingListModal.newListSuccess")
      .toPromise();

    const modal = await this.modalCtrl.create({
      component: NewShoppingListModalPage,
      componentProps: {
        openAfterCreate: false,
      },
    });
    modal.present();
    modal.onDidDismiss().then(({ data }) => {
      if (!data || !data.success || typeof data.id !== "string") return;
      const newId = data.id;

      this.shoppingListsQuery.refresh();

      let ref: EffectRef;
      ref = effect(
        () => {
          const lists = this.shoppingListsQuery.value();
          if (!lists) return;
          const newList = lists.find((l) => l.id === newId);
          if (!newList) return;
          ref.destroy();
          if (lists.length === 1) {
            this.destinationShoppingList = newList;
          } else {
            void this.toastCtrl
              .create({
                message,
                duration: 6000,
              })
              .then((toast) => toast.present());
          }
        },
        { injector: this.injector },
      );
    });
  }

  cancel() {
    this.modalCtrl.dismiss();
  }
}
