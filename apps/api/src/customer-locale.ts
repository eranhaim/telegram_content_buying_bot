export const customerLocales = ["en", "he", "ar", "ru", "fr", "es", "de", "pt-BR", "pt-PT"] as const;
export type CustomerLocale = typeof customerLocales[number];

const languageLocales: Record<string, CustomerLocale> = {
  en: "en",
  he: "he",
  iw: "he",
  ar: "ar",
  ru: "ru",
  fr: "fr",
  es: "es",
  de: "de",
  pt: "pt-BR",
  "pt-br": "pt-BR",
  "pt-pt": "pt-PT",
};

export function customerLocale(value: unknown): CustomerLocale {
  return supportedCustomerLocale(value) ?? "en";
}

export function supportedCustomerLocale(value: unknown): CustomerLocale | undefined {
  const normalized = typeof value === "string" ? value.trim().replace(/_/g, "-").toLowerCase() : "";
  return languageLocales[normalized] ?? languageLocales[normalized.split("-")[0]];
}

const countryLocales: Record<string, CustomerLocale> = {
  IL: "he", SA: "ar", AE: "ar", EG: "ar", JO: "ar", LB: "ar", MA: "ar", TN: "ar", DZ: "ar", IQ: "ar", QA: "ar", KW: "ar", RU: "ru", BY: "ru", FR: "fr", MC: "fr", ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", UY: "es", EC: "es", VE: "es", BO: "es", PY: "es", CR: "es", PA: "es", GT: "es", HN: "es", SV: "es", NI: "es", DO: "es", CU: "es", DE: "de", AT: "de", LI: "de", BR: "pt-BR", PT: "pt-PT", AO: "pt-PT", MZ: "pt-PT", US: "en", GB: "en", AU: "en", NZ: "en", IE: "en",
};

export function resolveCustomerLocale(options: { telegramLanguage?: unknown; country?: unknown; browserLanguage?: unknown; previousLocale?: unknown }): CustomerLocale {
  const telegram = supportedCustomerLocale(options.telegramLanguage);
  const country = typeof options.country === "string" ? countryLocales[options.country.toUpperCase()] : undefined;
  return telegram ?? country ?? supportedCustomerLocale(options.browserLanguage) ?? (isCustomerLocale(options.previousLocale) ? options.previousLocale : undefined) ?? "en";
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
  ar: {
    openCatalog: "فتح Vesper",
    welcome: "مرحبًا بك في Vesper. افتح التطبيق لتصفح المحتوى المتاح.",
    purchases: "افتح مشترياتك:",
    support: "للمساعدة في الدفع أو التسليم، تواصل مع Vesper.",
    deliveryStarting: "تم تأكيد الدفع. جارٍ إرسال محتواك الخاص الآن.",
  },
  ru: {
    openCatalog: "Открыть Vesper",
    welcome: "Добро пожаловать в Vesper. Откройте приложение, чтобы посмотреть доступный контент.",
    purchases: "Открыть ваши покупки:",
    support: "По вопросам оплаты или доставки обратитесь в Vesper.",
    deliveryStarting: "Оплата подтверждена. Ваш приватный контент отправляется.",
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
