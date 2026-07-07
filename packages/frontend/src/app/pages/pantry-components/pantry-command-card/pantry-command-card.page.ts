import { Component, inject } from "@angular/core";
import JsBarcode from "jsbarcode";

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
 * Barcode Buddy command grammar, verified against a live 1.8.1.5 instance
 * via GET /api/system/barcodes. Location switching via scanned barcodes is
 * NOT supported by Barcode Buddy — stock lands at each product's default
 * Grocy location, and placement/moves are done in the pantry UI.
 */
const COMMANDS: { key: string; barcode: string }[] = [
  { key: "add", barcode: "BBUDDY-P" },
  { key: "consume", barcode: "BBUDDY-C" },
  { key: "open", barcode: "BBUDDY-O" },
  { key: "consumeAll", barcode: "BBUDDY-CA" },
];

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
  commands = COMMANDS;

  constructor() {
    addIcons({ printOutline });
  }

  ionViewDidEnter() {
    for (const command of this.commands) {
      const element = document.getElementById(`command-barcode-${command.key}`);
      if (!element) continue;
      JsBarcode(element, command.barcode, {
        format: "CODE128",
        displayValue: true,
        height: 60,
        fontSize: 14,
        margin: 8,
      });
    }
  }

  print() {
    window.print();
  }
}
