export const customerLocales = ["en", "he", "fr", "es", "de", "pt-BR", "pt-PT"] as const;
export type CustomerLocale = typeof customerLocales[number];

const languageLocales: Record<string, CustomerLocale> = {
  en: "en",
  he: "he",
  iw: "he",
  fr: "fr",
  es: "es",
  de: "de",
  pt: "pt-BR",
  "pt-br": "pt-BR",
  "pt-pt": "pt-PT",
};

export function customerLocale(value: unknown): CustomerLocale {
  const normalized = typeof value === "string" ? value.trim().replace(/_/g, "-").toLowerCase() : "";
  return languageLocales[normalized] ?? languageLocales[normalized.split("-")[0]] ?? "en";
}

export function isCustomerLocale(value: unknown): value is CustomerLocale {
  return typeof value === "string" && (customerLocales as readonly string[]).includes(value);
}

type BotCopy = {
  openCatalog: string;
  welcome: string;
  purchases: string;
  support: string;
  deliveryStarting: string;
};

const botCopy: Record<CustomerLocale, BotCopy> = {
  en: {
    openCatalog: "Open catalog",
    welcome: "Welcome. Open the catalog to browse available content.",
    purchases: "Open your purchases:",
    support: "For payment or delivery support, contact the marketplace administrator.",
    deliveryStarting: "Payment confirmed. Your private content is being delivered now.",
  },
  he: {
    openCatalog: "פתיחת הקטלוג",
    welcome: "ברוכים הבאים. פתחו את הקטלוג כדי לעיין בתוכן הזמין.",
    purchases: "פתיחת הרכישות שלך:",
    support: "לתמיכה בתשלום או במסירה, יש לפנות למנהל השוק.",
    deliveryStarting: "התשלום אושר. התוכן הפרטי שלך נשלח כעת.",
  },
  fr: {
    openCatalog: "Ouvrir le catalogue",
    welcome: "Bienvenue. Ouvrez le catalogue pour parcourir le contenu disponible.",
    purchases: "Ouvrir vos achats :",
    support: "Pour une aide de paiement ou de livraison, contactez l’administrateur.",
    deliveryStarting: "Paiement confirmé. Votre contenu privé est en cours de livraison.",
  },
  es: {
    openCatalog: "Abrir catálogo",
    welcome: "Bienvenido. Abre el catálogo para explorar el contenido disponible.",
    purchases: "Abrir tus compras:",
    support: "Para ayuda con pagos o entregas, contacta al administrador.",
    deliveryStarting: "Pago confirmado. Tu contenido privado se está entregando.",
  },
  de: {
    openCatalog: "Katalog öffnen",
    welcome: "Willkommen. Öffne den Katalog, um verfügbare Inhalte anzusehen.",
    purchases: "Käufe öffnen:",
    support: "Bei Fragen zu Zahlung oder Lieferung wende dich an die Verwaltung.",
    deliveryStarting: "Zahlung bestätigt. Deine privaten Inhalte werden jetzt geliefert.",
  },
  "pt-BR": {
    openCatalog: "Abrir catálogo",
    welcome: "Boas-vindas. Abra o catálogo para ver o conteúdo disponível.",
    purchases: "Abrir suas compras:",
    support: "Para suporte de pagamento ou entrega, fale com a administração.",
    deliveryStarting: "Pagamento confirmado. Seu conteúdo privado está sendo entregue.",
  },
  "pt-PT": {
    openCatalog: "Abrir catálogo",
    welcome: "Bem-vindo. Abra o catálogo para ver o conteúdo disponível.",
    purchases: "Abrir as suas compras:",
    support: "Para apoio com pagamento ou entrega, contacte a administração.",
    deliveryStarting: "Pagamento confirmado. O seu conteúdo privado está a ser entregue.",
  },
};

export function customerBotCopy(locale: CustomerLocale) {
  return botCopy[locale];
}
