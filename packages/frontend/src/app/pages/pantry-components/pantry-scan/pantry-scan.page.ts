import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal,
} from "@angular/core";
import {
  ModalController,
  ToastController,
  ActionSheetController,
  NavController,
} from "@ionic/angular/standalone";
import { TranslateService } from "@ngx-translate/core";
import type { IScannerControls } from "@zxing/browser";

import { ServerActionsService } from "../../../services/server-actions.service";
import { SHARED_UI_IMPORTS } from "../../../providers/shared-ui.provider";
import { NewPantryItemModalPage } from "../new-pantry-item-modal/new-pantry-item-modal.page";
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonNote,
} from "@ionic/angular/standalone";

/**
 * Minimal typing for the native BarcodeDetector API (not yet in TS dom lib).
 */
interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector:
  | {
      new (options?: { formats: string[] }): NativeBarcodeDetector;
      getSupportedFormats(): Promise<string[]>;
    }
  | undefined;

/**
 * Ignore repeat reads of the same barcode within this window so an item held
 * in front of the camera counts once.
 */
const DEDUPE_MS = 3000;

@Component({
  standalone: true,
  selector: "page-pantry-scan",
  templateUrl: "pantry-scan.page.html",
  styleUrls: ["pantry-scan.page.scss"],
  imports: [
    ...SHARED_UI_IMPORTS,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonNote,
  ],
})
export class PantryScanPage {
  modalCtrl = inject(ModalController);
  toastCtrl = inject(ToastController);
  actionSheetCtrl = inject(ActionSheetController);
  navCtrl = inject(NavController);
  translate = inject(TranslateService);
  serverActionsService = inject(ServerActionsService);

  @ViewChild("video") videoRef?: ElementRef<HTMLVideoElement>;

  /**
   * Sticky scan intent: persists across consecutive scans in the session.
   */
  mode = signal<"add" | "consume">("add");
  cameraError = signal(false);

  private stream: MediaStream | null = null;
  private detectorInterval: ReturnType<typeof setInterval> | null = null;
  private zxingControls: IScannerControls | null = null;
  private lastCode = "";
  private lastCodeAt = 0;
  private busy = false;

  async ionViewDidEnter() {
    await this.startScanning();
  }

  ionViewWillLeave() {
    this.stopScanning();
  }

  onModeChange(event: CustomEvent) {
    this.mode.set(event.detail.value);
  }

  private async startScanning() {
    const video = this.videoRef?.nativeElement;
    if (!video) return;
    this.cameraError.set(false);

    try {
      if (typeof BarcodeDetector !== "undefined") {
        const detector = new BarcodeDetector();
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        video.srcObject = this.stream;
        await video.play();

        this.detectorInterval = setInterval(async () => {
          if (this.busy || video.readyState < 2) return;
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length) void this.onCode(barcodes[0].rawValue);
          } catch (_e) {
            // Detection errors on individual frames are non-fatal
          }
        }, 250);
      } else {
        // Pure-JS fallback for browsers without BarcodeDetector
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        this.zxingControls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result) => {
            if (result && !this.busy) void this.onCode(result.getText());
          },
        );
      }
    } catch (e) {
      console.error(e);
      this.cameraError.set(true);
    }
  }

  private stopScanning() {
    if (this.detectorInterval) {
      clearInterval(this.detectorInterval);
      this.detectorInterval = null;
    }
    if (this.zxingControls) {
      this.zxingControls.stop();
      this.zxingControls = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }

  private async onCode(barcode: string) {
    const now = Date.now();
    if (barcode === this.lastCode && now - this.lastCodeAt < DEDUPE_MS) {
      this.lastCodeAt = now;
      return;
    }
    this.lastCode = barcode;
    this.lastCodeAt = now;
    this.busy = true;

    try {
      const resolution = await this.serverActionsService.pantry.resolveBarcode({
        barcode,
      });
      if (!resolution) return;

      if (resolution.type === "product") {
        await this.applyIntent(resolution.product);
      } else if (resolution.type === "offProduct") {
        await this.openCreateModal(
          resolution.brand
            ? `${resolution.name} (${resolution.brand})`
            : resolution.name,
          barcode,
        );
      } else {
        await this.offerFallbacks(barcode);
      }
    } finally {
      this.busy = false;
    }
  }

  private async applyIntent(product: { id: number; name: string }) {
    if (this.mode() === "add") {
      await this.serverActionsService.pantry.addStock({
        productId: product.id,
        amount: 1,
      });
      await this.showToast("pages.pantryScan.added", { name: product.name });
    } else {
      await this.serverActionsService.pantry.consumeStock({
        productId: product.id,
        amount: 1,
      });
      await this.showToast("pages.pantryScan.consumed", {
        name: product.name,
      });
    }
  }

  private async openCreateModal(prefillName: string, barcode: string) {
    const modal = await this.modalCtrl.create({
      component: NewPantryItemModalPage,
      componentProps: {
        prefillName,
        prefillBarcode: barcode,
      },
    });
    await modal.present();
    await modal.onDidDismiss();
  }

  private async offerFallbacks(barcode: string) {
    const sheet = await this.actionSheetCtrl.create({
      header: this.translate.instant("pages.pantryScan.notFound.title"),
      subHeader: this.translate.instant("pages.pantryScan.notFound.subtitle"),
      buttons: [
        {
          text: this.translate.instant("pages.pantryScan.identifyPhoto"),
          handler: () => void this.openCreateModal("", barcode),
        },
        {
          text: this.translate.instant("pages.pantryScan.manualEntry"),
          handler: () => void this.openCreateModal("", barcode),
        },
        { text: this.translate.instant("generic.cancel"), role: "cancel" },
      ],
    });
    await sheet.present();
    await sheet.onDidDismiss();
  }

  private async showToast(key: string, params?: object) {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(key, params),
      duration: 2000,
      position: "top",
    });
    await toast.present();
  }
}
