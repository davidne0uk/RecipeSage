import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import {
  NavController,
  ModalController,
  ToastController,
  AlertController,
  ActionSheetController,
} from "@ionic/angular/standalone";
import { TranslateService } from "@ngx-translate/core";
import { PantryFillLevel } from "@recipesage/util/shared";

import { LoadingService } from "../../../services/loading.service";
import { UtilService, RouteMap } from "../../../services/util.service";
import { ServerActionsService } from "../../../services/server-actions.service";
import type { RouterOutputs } from "../../../services/server-actions/actions-base";
import { SHARED_UI_IMPORTS } from "../../../providers/shared-ui.provider";
import { NullStateComponent } from "../../../components/null-state/null-state.component";
import { NewPantryItemModalPage } from "../new-pantry-item-modal/new-pantry-item-modal.page";
import { photoFileToB64 } from "../pantry-photo.util";
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonTitle,
  IonButton,
  IonIcon,
  IonContent,
  IonPopover,
  IonListHeader,
  IonList,
  IonItem,
  IonItemGroup,
  IonItemDivider,
  IonLabel,
  IonBadge,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonNote,
} from "@ionic/angular/standalone";
import {
  addOutline,
  barcodeOutline,
  cameraOutline,
  ellipsisHorizontal,
  fileTrayStackedOutline,
  optionsOutline,
  printOutline,
} from "ionicons/icons";
import { addIcons } from "ionicons";

type PantryView = RouterOutputs["pantry"]["getPantry"];
type PantryItemView = PantryView[number]["items"][number];

const FILL_LEVELS: PantryFillLevel[] = [
  PantryFillLevel.Full,
  PantryFillLevel.ThreeQuarters,
  PantryFillLevel.Half,
  PantryFillLevel.Quarter,
  PantryFillLevel.Low,
];

@Component({
  standalone: true,
  selector: "page-pantry",
  templateUrl: "pantry.page.html",
  styleUrls: ["pantry.page.scss"],
  imports: [
    ...SHARED_UI_IMPORTS,
    NullStateComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonPopover,
    IonListHeader,
    IonList,
    IonItem,
    IonItemGroup,
    IonItemDivider,
    IonLabel,
    IonBadge,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonNote,
  ],
})
export class PantryPage {
  navCtrl = inject(NavController);
  modalCtrl = inject(ModalController);
  toastCtrl = inject(ToastController);
  alertCtrl = inject(AlertController);
  actionSheetCtrl = inject(ActionSheetController);
  loadingService = inject(LoadingService);
  utilService = inject(UtilService);
  translate = inject(TranslateService);
  serverActionsService = inject(ServerActionsService);

  @ViewChild("fillPhotoInput") fillPhotoInput?: ElementRef<HTMLInputElement>;

  pantry = signal<PantryView | undefined>(undefined);
  errorState = signal<"notConfigured" | "unavailable" | null>(null);

  private fillPhotoItem: PantryItemView | null = null;

  constructor() {
    addIcons({
      addOutline,
      barcodeOutline,
      cameraOutline,
      ellipsisHorizontal,
      fileTrayStackedOutline,
      optionsOutline,
      printOutline,
    });
  }

  ionViewWillEnter() {
    void this.load();
  }

  async load() {
    this.errorState.set(null);
    const result = await this.serverActionsService.pantry.getPantry({
      412: () => this.errorState.set("notConfigured"),
      500: () => this.errorState.set("unavailable"),
      0: () => this.errorState.set("unavailable"),
    });
    if (result) this.pantry.set(result);
  }

  fillLevelLabel(item: PantryItemView): string | null {
    if (!item.fillLevel) return null;
    const label = this.translate.instant(
      `pages.pantry.fillLevel.${item.fillLevel}`,
    );
    const spares = Math.floor(item.amount);
    // e.g. "2 + ½ full" when unopened spares exist alongside the open one
    if (item.amount % 1 > 0 && spares > 0) return `${spares} + ${label}`;
    return label;
  }

  quantityLabel(item: PantryItemView): string {
    const fillLabel = this.fillLevelLabel(item);
    if (fillLabel) return fillLabel;
    return `${item.amount} ${item.unitName}`.trim();
  }

  formatBestBefore(date: string): string {
    return this.translate.instant("pages.pantry.bestBefore", {
      date: new Date(date).toLocaleDateString(),
    });
  }

  openScanner() {
    this.navCtrl.navigateForward(RouteMap.PantryScanPage.getPath());
  }

  openCommandCard() {
    this.navCtrl.navigateForward(RouteMap.PantryCommandCardPage.getPath());
  }

  async addItem() {
    const modal = await this.modalCtrl.create({
      component: NewPantryItemModalPage,
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data?.created) void this.load();
  }

  async newLocation() {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant("pages.pantry.newLocation"),
      inputs: [
        {
          name: "name",
          type: "text",
          placeholder: this.translate.instant("pages.pantry.newLocation.name"),
        },
      ],
      buttons: [
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
        {
          text: this.translate.instant("generic.save"),
          handler: (values) => {
            const name = (values.name || "").trim();
            if (!name) return false;
            void this.serverActionsService.pantry
              .createLocation({ name })
              .then((result) => result && this.load());
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async locationOptions(location: PantryView[number]["location"]) {
    const sheet = await this.actionSheetCtrl.create({
      header: location.name,
      buttons: [
        {
          text: this.translate.instant("pages.pantry.renameLocation"),
          handler: () => void this.renameLocation(location),
        },
        {
          text: this.translate.instant("pages.pantry.deleteLocation"),
          role: "destructive",
          handler: () => void this.deleteLocation(location),
        },
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
  }

  private async renameLocation(location: PantryView[number]["location"]) {
    const alert = await this.alertCtrl.create({
      header: this.translate.instant("pages.pantry.renameLocation"),
      inputs: [{ name: "name", type: "text", value: location.name }],
      buttons: [
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
        {
          text: this.translate.instant("generic.save"),
          handler: (values) => {
            const name = (values.name || "").trim();
            if (!name) return false;
            void this.serverActionsService.pantry
              .renameLocation({ locationId: location.id, name })
              .then(() => this.load());
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteLocation(location: PantryView[number]["location"]) {
    const entry = this.pantry()?.find(
      (candidate) => candidate.location.id === location.id,
    );
    const hasItems = !!entry && entry.items.length > 0;

    if (!hasItems) {
      await this.serverActionsService.pantry.deleteLocation({
        locationId: location.id,
      });
      void this.load();
      return;
    }

    const destinations = (this.pantry() || [])
      .map((candidate) => candidate.location)
      .filter((candidate) => candidate.id !== location.id);

    const sheet = await this.actionSheetCtrl.create({
      header: this.translate.instant("pages.pantry.deleteLocation.moveTo"),
      buttons: [
        ...destinations.map((destination) => ({
          text: destination.name,
          handler: () => {
            void this.serverActionsService.pantry
              .deleteLocation({
                locationId: location.id,
                moveItemsToLocationId: destination.id,
              })
              .then(() => this.load());
          },
        })),
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
  }

  async itemOptions(item: PantryItemView) {
    const isContainer = !!item.fillLevel;

    const sheet = await this.actionSheetCtrl.create({
      header: item.name,
      buttons: [
        {
          text: this.translate.instant("pages.pantry.item.addOne"),
          handler: () =>
            void this.mutateAndReload(() =>
              this.serverActionsService.pantry.addStock({
                productId: item.productId,
                amount: 1,
                locationId: item.locationId,
              }),
            ),
        },
        {
          text: this.translate.instant("pages.pantry.item.consumeOne"),
          handler: () =>
            void this.mutateAndReload(() =>
              this.serverActionsService.pantry.consumeStock({
                productId: item.productId,
                amount: Math.min(1, item.amount),
              }),
            ),
        },
        ...(isContainer
          ? [
              {
                text: this.translate.instant("pages.pantry.item.setFillLevel"),
                handler: () => void this.pickFillLevel(item),
              },
              {
                text: this.translate.instant(
                  "pages.pantry.item.estimateFillLevel",
                ),
                handler: () => this.startFillPhoto(item),
              },
            ]
          : []),
        {
          text: this.translate.instant("pages.pantry.item.move"),
          handler: () => void this.moveItem(item),
        },
        {
          text: this.translate.instant("pages.pantry.item.consumeAll"),
          role: "destructive",
          handler: () =>
            void this.mutateAndReload(() =>
              this.serverActionsService.pantry.consumeStock({
                productId: item.productId,
                amount: item.amount,
              }),
            ),
        },
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
  }

  private async mutateAndReload(mutation: () => Promise<unknown>) {
    const loading = this.loadingService.start();
    try {
      await mutation();
    } finally {
      loading.dismiss();
    }
    await this.load();
  }

  private async moveItem(item: PantryItemView) {
    const destinations = (this.pantry() || [])
      .map((entry) => entry.location)
      .filter((location) => location.id !== item.locationId);

    const sheet = await this.actionSheetCtrl.create({
      header: this.translate.instant("pages.pantry.item.move"),
      buttons: [
        ...destinations.map((destination) => ({
          text: destination.name,
          handler: () => {
            void this.mutateAndReload(() =>
              this.serverActionsService.pantry.moveItem({
                productId: item.productId,
                toLocationId: destination.id,
              }),
            );
          },
        })),
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
  }

  async pickFillLevel(item: PantryItemView, suggested?: PantryFillLevel) {
    const suggestedSuffix = this.translate.instant(
      "pages.pantry.fillLevel.suggested",
    );
    const sheet = await this.actionSheetCtrl.create({
      header: item.name,
      buttons: [
        ...FILL_LEVELS.map((level) => ({
          text:
            this.translate.instant(`pages.pantry.fillLevel.${level}`) +
            (level === suggested ? ` ${suggestedSuffix}` : ""),
          handler: () => {
            void this.mutateAndReload(() =>
              this.serverActionsService.pantry.setFillLevel({
                productId: item.productId,
                fillLevel: level,
              }),
            );
          },
        })),
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
  }

  startFillPhoto(item: PantryItemView) {
    this.fillPhotoItem = item;
    this.fillPhotoInput?.nativeElement.click();
  }

  async onFillPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const item = this.fillPhotoItem;
    this.fillPhotoItem = null;
    if (!file || !item) return;

    const loading = this.loadingService.start();
    let estimate;
    try {
      const image = await photoFileToB64(file);
      estimate = await this.serverActionsService.pantry.estimateFillLevel(
        { image },
        {
          500: () => void this.showToast("pages.pantry.fillLevel.unavailable"),
        },
      );
    } finally {
      loading.dismiss();
    }

    // Always confirmed by the user: the estimate only preselects a bucket
    await this.pickFillLevel(item, estimate?.fillLevel);
  }

  private async showToast(key: string) {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(key),
      duration: 5000,
    });
    await toast.present();
  }
}
