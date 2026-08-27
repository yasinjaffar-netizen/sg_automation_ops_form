// Static option lists + hardware config for the EPOS Jobsheet form.
// Mirrors the jobsheet question spec 1:1 so App.jsx can stay a renderer,
// not 50 near-duplicate field blocks.

// Must match the "salesperson_new" Ticket property's option labels exactly.
export const SALESPEOPLE = [
  "Hadi Sng",
  "Alvin Seah",
  "Andy Chia",
  "Arvinder Singh Chowhan",
  "Belle Phia Chen Yen",
  "Brandon Leong",
  "Crystal Lee",
  "Glenn Wee",
  "Harold Lim",
  "Mei En Tan",
  "Mervin Cai",
  "Tasha Goh",
  "Winston Heng",
  "Zack Gaffar",
];

// Must match the "pos_package" Ticket property's option labels exactly - rename the
// "PSG Retail (solution only)" / "PSG F&B (solution only)" options in HubSpot to drop the
// "(solution only)" suffix to match (the option's internal value is unaffected by a label
// rename, so existing tickets/data stay intact).
export const POS_PACKAGE_OPTIONS = ["PSG Retail", "PSG F&B", "Others"];

// Must match the "payment_status" Ticket property's option labels exactly.
export const PAYMENT_STATUS_OPTIONS = ["PSG Applied", "Invoice Sent", "Payment Collected", "Closed Won (Automated)", "Payment Verified"];

// New, separate from "payment_status" (deal-stage based). Property pending creation in
// HubSpot as "payment_received" - see server/main.py FIELD_PROPERTY_MAP.
export const PAYMENT_RECEIVED_OPTIONS = ["Paid", "Not Paid"];

// Must match the "business_type" Ticket property's option labels exactly.
export const BUSINESS_TYPE_OPTIONS = [
  "Retail",
  "Minimart",
  "F&B",
  "F&B (Full Service)",
  "Spa / Salon",
  "Gym / Fitness",
  "Clinic",
  "School / Academy",
  "Other",
];

export const WHATSAPP_GROUP_OPTIONS = ["Create New Group Chat", "Use Existing Group Chat"];

export const SUBSCRIPTION_OPTIONS = [
  "[New] $39/mth/terminal - EPOS Service Subscription (Standard)",
  "[New] $59/mth/terminal - EPOS Service Subscription (Advance F&B)",
  "[Old] $240 cloud + $480 tech support (per yr/terminal)",
  "[Old] $480 cloud w integration + $480 tech support (per yr/terminal)",
  "[Old] $240 cloud + $480 tech support + $360 e-store hosting (per yr/terminal)",
  "[Old] $480 cloud w integration + $480 tech support + $360 e-store hosting (per yr/terminal)",
  "Other",
];

// Parent of "Existing Setup" — must match the "setup_type" Ticket property's option labels.
export const SETUP_TYPE_OPTIONS = ["New", "Existing"];

export const STORE_CONDITION_OPTIONS = ["New Store", "Existing Store"];

// Shown only when Setup Type = "Existing". Must match the "existing_setup" Ticket property.
export const EXISTING_SETUP_OPTIONS = ["Old Backend + Create New Outlet", "Different Backend"];

export const MULTI_POS_OPTIONS = ["Master - Master", "Master - Slave"];

export const TAX_RULE_OPTIONS = [
  "No GST",
  "GST inclusive",
  "GST exclusive",
  "Service Charge + GST exclusive",
  "Service Charge + GST inclusive",
  "Service Charge only",
];

export const SPECIAL_PAYMENT_OPTIONS = ["Antom cc", "Integrated PayNow", "NETS"];
export const ANTOM_CC_OPTIONS = ["Terminal", "Online"];
export const PAYNOW_DOC_OPTIONS = ["UOB Documents Provided", "UOB Documents not Provided"];
export const PAYNOW_COMPLETION_OPTIONS = ["Auto Completion", "Manual Completion"];
export const NETS_OPTIONS = ["Integrated", "Standalone"];

export const INTEGRATION_OPTIONS = [
  "Epos Web Ordering App",
  "Accounting Integration",
  "E-commerce Integration",
  "Delivery",
];
export const EPOS_WEB_ORDERING_OPTIONS = ["In-Store", "E-Store"];
export const ACCOUNTING_PLATFORM_OPTIONS = ["Xero", "Quickbooks"];
export const ECOMMERCE_PLATFORM_OPTIONS = ["Shopify", "WooCommerce"];
export const ACCOUNT_STATUS_OPTIONS = ["Existing account", "New account"];
export const WHEN_TO_INTEGRATE_OPTIONS = ["Immediate", "After installation"];
export const DELIVERY_PLATFORM_OPTIONS = ["GrabFood", "GrabMart", "Foodpanda", "Lalamove"];

export const ADDITIONAL_INTEGRATION_OPTIONS = [
  "A-Eye: 1 main & 1 add terminal (charge: $1846)",
  "Cash Machine: excluding hardware (charge: $3800)",
  "Sales ERP (charge: $1800)",
  "Mall Sending (charge: $350)",
  "Booking Module",
];

export const REQUIREMENT_OPTIONS = [
  "Training must be conducted in Chinese",
  "Table management (table layout to be provided)",
  "Export data from existing system",
  "No training provided, only install the v5 system",
];

const DEFAULT_PACKAGE_OPTIONS = ["Part of package", "PWP / Buying", "Other"];

// Hardware selectable in "Select Hardware*" (Q34), in spec order.
export const HARDWARE_OPTIONS = [
  { key: "main_terminal", label: "Main Terminal" },
  { key: "customer_display", label: "Customer Display" },
  { key: "kiosk", label: "KIOSK (Android)" },
  { key: "keyboard_mouse", label: "Keyboard + Mouse (Logitech)" },
  { key: "receipt_printer", label: "Receipt Printer" },
  { key: "cash_drawer", label: "Cash Drawer" },
  { key: "barcode_printer", label: "Barcode Printer" },
  { key: "barcode_scanner", label: "Barcode Scanner" },
  { key: "stocktake_device", label: "Stocktake Device (Imin Swift 1)" },
  { key: "kitchen_printer", label: "Kitchen Printer" },
  { key: "kds", label: "KDS (Android)" },
  { key: "soundbox", label: "Soundbox" },
  { key: "weighing_scale", label: "Weighing Scale" },
  { key: "queue_display", label: "Queue Display" },
  { key: "ups", label: "UPS (Collinson)" },
  { key: "buzzers", label: "Buzzers*" },
];

// Per-hardware sub-questions (Q35-49). `hardwareOptions` omitted where the
// spec doesn't list a hardware-model dropdown for that item (Receipt Printer,
// Stocktake Device, KDS, Soundbox, Queue Display, UPS, Buzzers all get just
// Number + Package [+ extra fields] in the source doc).
export const HARDWARE_CONFIG = {
  main_terminal: {
    numberLabel: "Number of Main Terminal(s)",
    hardwareLabel: "Main Terminal(s) Hardware",
    hardwareOptions: ["Senor X3se (Gold)", "Apexa (Grey)", "Apexa (White)**", "Falcon 2", "Falcon 2 w/ printer dock", "N950"],
    packageLabel: "Main Terminal(s) Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  customer_display: {
    numberLabel: "Number of Customer Display(s)",
    hardwareLabel: "Customer Display Hardware",
    hardwareOptions: [
      "Senor X3se (Gold) Integrated Customer Display",
      "VFD",
      "VFD Pole (for request only)**",
      '15" attached (Grey)',
      '15" attached (White)',
      '15" w stand (Grey)',
      '15" w stand (White)',
    ],
  },
  kiosk: {
    numberLabel: "Number of Kiosk(s)",
    hardwareLabel: "Kiosk Hardware",
    hardwareOptions: ["Regular (Sunmi K2)**", "Table Top (Imin Crane1)**"],
    packageLabel: "Kiosk Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  keyboard_mouse: {
    numberLabel: "Number of Keyboard + Mouse(s)",
    hardwareLabel: "Keyboard + Mouse Hardware",
    hardwareOptions: ["MK120 (wired)", "MK220 (wireless)"],
    packageLabel: "Keyboard + Mouse Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  receipt_printer: {
    numberLabel: "Number of Receipt Printer(s)",
    packageLabel: "Receipt Printer Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
    extraFields: [{ key: "thermal_roll_qty", label: "Number of Thermal Receipt Roll(s)", type: "number" }],
  },
  cash_drawer: {
    numberLabel: "Number of Cash Drawer(s)",
    hardwareLabel: "Cash Drawer Hardware",
    hardwareOptions: ["EC-410 Black (big)", "Safescan LD-3336 (small)"],
    packageLabel: "Cash Drawer Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
    extraFields: [{ key: "speakers", label: "Speakers (used for Umart Cash Drawer)", type: "checkbox" }],
  },
  barcode_printer: {
    numberLabel: "Number of Barcode Printer(s)",
    hardwareLabel: "Barcode Printer Hardware",
    hardwareOptions: ["Bixolon (Lan)**", "Bixolon (USB)**"],
    packageLabel: "Barcode Printer Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
    extraFields: [
      { key: "sticker_roll", label: "Bixolon Barcode Sticker Rolls", type: "select", options: ["50x30", "30x15", "60x30", "Other"] },
    ],
  },
  barcode_scanner: {
    numberLabel: "Number of Barcode Scanner(s)",
    hardwareLabel: "Barcode Scanner Hardware",
    hardwareOptions: ["LS220 (wired w stand)", "LS280 (can scan NEA or MAI voucher)", "Zebex (wireless)**", "Zebex Ball Scanner"],
    packageLabel: "Barcode Scanner Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  stocktake_device: {
    numberLabel: "Number of Stocktake Device(s)",
    packageLabel: "Stocktake Device Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  kitchen_printer: {
    numberLabel: "Number of Kitchen Printer(s)",
    packageLabel: "Kitchen Printer Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
    extraFields: [{ key: "thermal_roll_qty_kitchen", label: "Number of Thermal Receipt Roll(s) [Kitchen]", type: "number" }],
  },
  kds: {
    numberLabel: "Number of KDS",
    packageLabel: "KDS Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  soundbox: {
    numberLabel: "Number of Soundbox",
    packageLabel: "Soundbox Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  weighing_scale: {
    numberLabel: "Number of Weighing Scale(s)",
    hardwareLabel: "Weighing Scale Hardware",
    hardwareOptions: ["Integrated (w pole)*", "Barcoded**"],
    packageLabel: "Weighing Scale Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
    extraFields: [{ key: "weighing_sticker_roll_qty", label: "Number of Barcoded Weighing Scale Sticker Roll(s)", type: "number" }],
  },
  queue_display: {
    numberLabel: "Number of Queue Display(s)",
    packageLabel: "Queue Display Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  ups: {
    numberLabel: "Number of UPS",
    packageLabel: "UPS Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
  buzzers: {
    numberLabel: "Number of Buzzer(s)",
    packageLabel: "Buzzers Package",
    packageOptions: DEFAULT_PACKAGE_OPTIONS,
  },
};
