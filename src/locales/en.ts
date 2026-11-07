import type hu from "./hu";

type ShapeOf<T> = T extends string ? string : { [K in keyof T]: ShapeOf<T[K]> };

// Key completeness is checked against the Hungarian source of truth;
// additive English keys (e.g. plural forms hu does not use) stay allowed.
const translation = {
  languageNames: { hu: "Magyar", en: "English" },
  languageDialog: {
    open: "Language and region",
    close: "Close",
    language: "Language",
    region: "Region",
    regionValue: "Hungary (HUF)",
  },
  common: {
    logoAlt: "Babasarok logo",
    close: "Close",
    previous: "Previous",
    next: "Next",
    previousImage: "Previous image",
    nextImage: "Next image",
    quantityDecrease: "Decrease quantity",
    quantityIncrease: "Increase quantity",
    piece: "pc",
  },
  header: {
    menu: "Menu",
    contact: "Contact",
  },
  footer: {
    page: "Page",
    address: "Address",
  },
  search: {
    open: "Search",
    label: "Search",
    placeholder: "Search…",
    unavailable: "Search is currently unavailable.",
    results: "{{count}} results",
    product: "Products",
    material: "Materials",
    blog: "References",
  },
  consent: {
    banner: "Data processing consent",
    acceptAll: "Accept all",
    settings: "Settings",
    dialog: "Cookie settings",
    description:
      "Control which types of cookies you allow here. You can change these settings at any time.",
    details: "Details",
    rejectAll: "Reject all",
    save: "Save settings",
    name: "Name",
    domain: "Domain",
    lifetime: "Storage time",
    saved: "Settings saved",
    savedText:
      "Your cookie settings have been saved. You can revoke them at any time in the privacy policy.",
    ok: "OK",
  },
  basket: {
    label: "Basket",
    empty: "Your basket is empty.",
    edit: "Edit",
    remove: "Delete",
    browse: "Browse products",
    checkout: "Checkout",
    inBasket: "In basket",
    configure: "Configure",
    add: "Add",
    syncMaterial: "Match material",
    viewAllColors: "View all colors",
    color: "Color",
    selectOption: "Choose an option",
    text: "Text",
    threadColor: "Thread color",
    perWord: " / word",
  },
  price: {
    base: "Base price",
    perMeter: "Price per meter",
    perUnit: "Unit price",
    total: "Total",
  },
  related: {
    title: "Related products",
  },
  set: {
    suffix: "{{title}} set",
    hint: "Buy the pieces of the set together and get a discount. The discount appears in the basket.",
    notReady: "Fill in this product's details first, then you can add the set pieces.",
    discounts: "Set discounts",
  },
  filters: {
    title: "Filter",
    clear: "Clear filters",
    done: "Done",
    sort: "Sort",
    popular: "Popular",
    newest: "Newest",
    name: "By name",
    noResults: "No results",
    type: "Product type",
  },
  checkout: {
    title: "Checkout",
    success: "Your order has been sent! We will contact you shortly.",
    orderNumber: "Order number:",
    backToProducts: "Back to the products",
    basketUnavailable: "The basket is currently unavailable.",
    basketEmpty: "Your basket is empty.",
    viewProducts: "View the products",
    lastName: "Last name *",
    firstName: "First name *",
    email: "Email address *",
    phone: "Phone number",
    messagePlaceholder:
      "Write here if you have custom colors, patterns, or any custom request (e.g. embroidered name)!",
    shipping: "Shipping",
    free: "Free",
    total: "Total",
    testingNotice:
      "The ordering process is currently under testing. If you run into any problems, please let us know via",
    testingNoticeLink: "our email address",
    termsPrefix: "I accept the",
    termsLink: "General Terms and Conditions (GTC)",
    placeOrder: "Place the order!",
  },
  delivery: {
    heading: "How would you like to receive the package?",
    addressPlaceholder: "Enter the shipping address",
  },
  order: {
    priceChanged:
      "The price you saw on the page ({{shown}}) has changed; the current unit price: {{actual}}.",
    priceChangedBasket:
      "The price you saw on the page ({{shown}}) has changed; the basket has the current price: {{actual}}.",
    unsaved: "Not saved: the changes are not in the basket yet.",
    inBasket: "The product is in the basket.",
    toCheckout: "Go to checkout",
    addToBasket: "Add to basket",
    updateBasket: "Update basket",
  },
  errors: {
    loadMethods: "Shipping methods cannot be loaded right now. Reload the page.",
    changeFailed: "Changing the basket failed. Reload the page and try again.",
    validate: "Please check the product details and fill in the missing fields.",
    addFailed: "The product was not added to the basket. Reload the page and try again.",
    notOrderable: "This product cannot be ordered at the moment.",
    reload: "Reload the page",
  },
  blockers: {
    empty: "Your basket is empty.",
    invalid:
      "Some products cannot be ordered this way. Edit or fill in the marked items, then you can place the order.",
    name: "Please enter your full name.",
    email: "Please enter your email address.",
    terms: "Accepting the GTC is required.",
    method: "Please choose a shipping method.",
    address: "Please enter the shipping address for the shipping method.",
  },
  errorCodes: {
    EMAIL_ADDRESS_CONFLICT_ERROR:
      "This email address already belongs to a registered account. Please enter a different email address.",
  },
  pages: {
    notFound: "Page not found (404)",
    unavailable: "The content is temporarily unavailable",
    products: "Products",
    materials: "Materials",
    blog: "References",
    contactHeading: "Contact",
    addressHeading: "Address",
    socialHeading: "Social Media",
    consentEdit: "Change consent",
    consentEditHint: "Pressing the button shows the consent dialog again.",
    colors: "Colors",
    colorsNotice:
      "The colors may differ in reality, and shade variations can occur compared to what is seen in the images.",
    jumpToProduct: "Jump to the product",
  },
} as const satisfies ShapeOf<typeof hu>;

export default translation;
