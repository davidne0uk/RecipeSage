import {
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import { ModalController, ToastController } from "@ionic/angular/standalone";
import { TranslateService } from "@ngx-translate/core";

import { LoadingService } from "../../../services/loading.service";
import { ServerActionsService } from "../../../services/server-actions.service";
import type { RouterOutputs } from "../../../services/server-actions/actions-base";
import { SHARED_UI_IMPORTS } from "../../../providers/shared-ui.provider";
import { TextInputComponent } from "../../../components/forms/text-input/text-input.component";
import { photoFileToB64 } from "../pantry-photo.util";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonFooter,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonNote,
} from "@ionic/angular/standalone";
import { cameraOutline, checkmarkOutline, closeOutline } from "ionicons/icons";
import { addIcons } from "ionicons";

@Component({
  standalone: true,
  selector: "page-new-pantry-item-modal",
  templateUrl: "new-pantry-item-modal.page.html",
  styleUrls: ["new-pantry-item-modal.page.scss"],
  imports: [
    ...SHARED_UI_IMPORTS,
    TextInputComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonFooter,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonNote,
  ],
})
export class NewPantryItemModalPage implements OnInit {
  modalCtrl = inject(ModalController);
  toastCtrl = inject(ToastController);
  loadingService = inject(LoadingService);
  translate = inject(TranslateService);
  serverActionsService = inject(ServerActionsService);

  @ViewChild("identifyPhotoInput")
  identifyPhotoInput?: ElementRef<HTMLInputElement>;

  /**
   * Pre-fill support for the scan flow (unknown barcode / OFF hit).
   */
  @Input() prefillName = "";
  @Input() prefillBarcode = "";

  name = "";
  barcode = "";
  amount = 1;
  bestBeforeDate = "";
  locationId: number | null = null;
  quantityUnitId: number | null = null;

  locations = signal<RouterOutputs["pantry"]["getLocations"] | undefined>(
    undefined,
  );
  quantityUnits = signal<
    RouterOutputs["pantry"]["getQuantityUnits"] | undefined
  >(undefined);
  lowConfidence = signal(false);
  saving = false;

  constructor() {
    addIcons({ cameraOutline, checkmarkOutline, closeOutline });
  }

  async ngOnInit() {
    this.name = this.prefillName;
    this.barcode = this.prefillBarcode;

    const [locations, quantityUnits] = await Promise.all([
      this.serverActionsService.pantry.getLocations(),
      this.serverActionsService.pantry.getQuantityUnits(),
    ]);
    if (locations) {
      this.locations.set(locations);
      this.locationId = locations[0]?.id ?? null;
    }
    if (quantityUnits) {
      this.quantityUnits.set(quantityUnits);
      this.quantityUnitId = quantityUnits[0]?.id ?? null;
    }
  }

  startIdentifyPhoto() {
    this.identifyPhotoInput?.nativeElement.click();
  }

  async onIdentifyPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const loading = this.loadingService.start();
    let identification;
    try {
      const image = await photoFileToB64(file);
      identification =
        await this.serverActionsService.pantry.identifyProductPhoto(
          { image },
          {
            500: () =>
              void this.showToast("pages.newPantryItem.identifyUnavailable"),
          },
        );
    } finally {
      loading.dismiss();
    }
    if (!identification) return;

    if (!identification.identified) {
      await this.showToast("pages.newPantryItem.identifyFailed");
      return;
    }

    // Proposal only — the user reviews and saves explicitly
    this.name = identification.brand
      ? `${identification.name} (${identification.brand})`
      : identification.name;
    this.lowConfidence.set(identification.confidence === "low");

    const units = this.quantityUnits() || [];
    const matchingUnit = units.find(
      (unit) =>
        unit.name.toLowerCase() === identification.containerType.toLowerCase(),
    );
    if (matchingUnit) this.quantityUnitId = matchingUnit.id;
  }

  isFormValid() {
    return (
      this.name.trim().length > 0 &&
      this.locationId !== null &&
      this.quantityUnitId !== null &&
      this.amount > 0
    );
  }

  async save() {
    if (this.saving || !this.isFormValid()) return;
    this.saving = true;
    const loading = this.loadingService.start();

    const result = await this.serverActionsService.pantry.createProduct({
      name: this.name.trim(),
      locationId: this.locationId!,
      quantityUnitId: this.quantityUnitId!,
      barcode: this.barcode.trim() || undefined,
      initialAmount: this.amount,
      bestBeforeDate: this.bestBeforeDate || undefined,
    });

    this.saving = false;
    loading.dismiss();
    if (!result) return;

    this.modalCtrl.dismiss({ created: true, productId: result.productId });
  }

  cancel() {
    this.modalCtrl.dismiss();
  }

  private async showToast(key: string) {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(key),
      duration: 5000,
    });
    await toast.present();
  }
}
