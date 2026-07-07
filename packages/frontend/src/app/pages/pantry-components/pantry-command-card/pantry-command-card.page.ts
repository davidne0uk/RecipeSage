import { Component, inject, signal } from "@angular/core";
import JsBarcode from "jsbarcode";

import { ServerActionsService } from "../../../services/server-actions.service";
import type { RouterOutputs } from "../../../services/server-actions/actions-base";
import { SHARED_UI_IMPORTS } from "../../../providers/shared-ui.provider";
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonButton,
  IonIcon,
  IonContent,
  IonNote,
} from "@ionic/angular/standalone";
import { printOutline } from "ionicons/icons";
import { addIcons } from "ionicons";

/**
 * Barcode Buddy command grammar. BBUDDY-* are Barcode Buddy's built-in mode
 * commands; grcy:l:<id> is the Grocy location barcode format it understands
 * for location switching. Verify against the installed Barcode Buddy version
 * during station setup (see scripts/pantry/README.md) and adjust here if the
 * grammar differs.
 */
const COMMAND_ADD = "BBUDDY-P";
const COMMAND_CONSUME = "BBUDDY-C";
const locationCommand = (locationId: number) => `grcy:l:${locationId}`;

@Component({
  standalone: true,
  selector: "page-pantry-command-card",
  templateUrl: "pantry-command-card.page.html",
  styleUrls: ["pantry-command-card.page.scss"],
  imports: [
    ...SHARED_UI_IMPORTS,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonNote,
  ],
})
export class PantryCommandCardPage {
  serverActionsService = inject(ServerActionsService);

  locations = signal<RouterOutputs["pantry"]["getLocations"] | undefined>(
    undefined,
  );

  constructor() {
    addIcons({ printOutline });
  }

  async ionViewWillEnter() {
    const locations = await this.serverActionsService.pantry.getLocations();
    if (!locations) return;
    this.locations.set(locations);

    // Render after the @for has created the SVG elements
    setTimeout(() => this.renderBarcodes(), 0);
  }

  private renderBarcodes() {
    this.renderBarcode("command-barcode-add", COMMAND_ADD);
    this.renderBarcode("command-barcode-consume", COMMAND_CONSUME);
    for (const location of this.locations() || []) {
      this.renderBarcode(
        `command-barcode-location-${location.id}`,
        locationCommand(location.id),
      );
    }
  }

  private renderBarcode(elementId: string, value: string) {
    const element = document.getElementById(elementId);
    if (!element) return;
    JsBarcode(element, value, {
      format: "CODE128",
      displayValue: true,
      height: 60,
      fontSize: 14,
      margin: 8,
    });
  }

  print() {
    window.print();
  }
}
