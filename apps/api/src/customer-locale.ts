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
    openCatalog: "Open Vesper",
    welcome: "Welcome to Vesper. Open it to browse what’s available.",
    purchases: "Open your purchases:",
    support: "For payment or delivery support, contact Vesper.",
    deliveryStarting: "Payment confirmed. Your private content is being delivered now.",
  },
  he: {
    openCatalog: "פתיחת Vesper",
    welcome: "ברוכים הבאים ל-Vesper. פתחו כדי לעיין במה שזמין.",
    purchases: "פתיחת הרכישות שלך:",
    support: "לתמיכה בתשלום או במסירה, פנו ל-Vesper.",
    deliveryStarting: "התשלום אושר. התוכן הפרטי שלך נשלח כעת.",
  },
  fr: {
    openCatalog: "Ouvrir Vesper",
    welcome: "Bienvenue sur Vesper. Ouvrez-le pour parcourir ce qui est disponible.",
    purchases: "Ouvrir vos achats :",
    support: "Pour une aide de paiement ou de livraison, contactez Vesper.",
    deliveryStarting: "Paiement confirmé. Votre contenu privé est en cours de livraison.",
  },
  es: {
    openCatalog: "Abrir Vesper",
    welcome: "Bienvenido a Vesper. Ábrelo para ver lo que hay disponible.",
    purchases: "Abrir tus compras:",
    support: "Para ayuda con pagos o entregas, contacta a Vesper.",
    deliveryStarting: "Pago confirmado. Tu contenido privado se está entregando.",
  },
  de: {
    openCatalog: "Vesper öffnen",
    welcome: "Willkommen bei Vesper. Öffne es, um zu sehen, was verfügbar ist.",
    purchases: "Käufe öffnen:",
    support: "Bei Fragen zu Zahlung oder Lieferung wende dich an Vesper.",
    deliveryStarting: "Zahlung bestätigt. Deine privaten Inhalte werden jetzt geliefert.",
  },
  "pt-BR": {
    openCatalog: "Abrir Vesper",
    welcome: "Boas-vindas ao Vesper. Abra para ver o que está disponível.",
    purchases: "Abrir suas compras:",
    support: "Para suporte de pagamento ou entrega, fale com a Vesper.",
    deliveryStarting: "Pagamento confirmado. Seu conteúdo privado está sendo entregue.",
  },
  "pt-PT": {
    openCatalog: "Abrir Vesper",
    welcome: "Bem-vindo ao Vesper. Abra para ver o que está disponível.",
    purchases: "Abrir as suas compras:",
    support: "Para apoio com pagamento ou entrega, contacte a Vesper.",
    deliveryStarting: "Pagamento confirmado. O seu conteúdo privado está a ser entregue.",
  },
};

export function customerBotCopy(locale: CustomerLocale) {
  return botCopy[locale];
}
