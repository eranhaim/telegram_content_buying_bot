export type AdminLanguage = "en" | "he";

type AdminCopy = {
  language: string; english: string; hebrew: string; signIn: string; password: string;
  adminTitle: string; catalogue: string; setup: string; signOut: string; save: string;
  saved: string; saveFailed: string; createAgency: string; createAgent: string;
  agencyName: string; workspaceId: string; agentName: string; agentId: string;
  agency: string; agent: string; chooseAgency: string; chooseCreator: string;
  workspaceHelp: string; agentHelp: string; attributionTitle: string; attributionHelp: string;
  secretWarning: string; setupEmpty: string; agencyEmpty: string; agentEmpty: string;
  setCheckoutAgent: string; checkoutAgentSet: string; creatorCatalogue: string;
  catalogueHelp: string; creatorEmpty: string; addCreator: string; newCreator: string;
  creatorName: string; creatorSlug: string; creatorBio: string; approvingAdmin: string;
  rightsHelp: string; createCreator: string; creatorCreated: string; publish: string;
  published: string; draft: string; content: string; backToCatalogue: string;
  contentHelp: string; contentEmpty: string; addContent: string; newContent: string;
  productTitle: string; productSlug: string; description: string; price: string;
  currency: string; preview: string; noPreview: string; privateFiles: string;
  selectPrivateFiles: string; createProduct: string; productCreated: string;
  uploadMedia: string; uploadPurpose: string; deliveryFile: string; previewFile: string;
  chooseFile: string; upload: string; uploadHelp: string; mediaUploaded: string;
  uploadFailed: string; mediaLimit: string; noMedia: string; noCreators: string;
  selectFiles: string; priceMinimum: string; loading: string; requestFailed: string;
  invalidCredentials: string; signInFailed: string; close: string; privateDelivery: string;
  storefrontPreview: string; status: string; media: string; required: string;
};

export const adminCopy: Record<AdminLanguage, AdminCopy> = {
  en: {
    language: "Language", english: "English", hebrew: "עברית", signIn: "Administrator sign in", password: "Password",
    adminTitle: "Marketplace administration", catalogue: "Catalogue", setup: "Workspace setup", signOut: "Sign out",
    save: "Save", saved: "Saved.", saveFailed: "Could not save your changes.",
    createAgency: "Create agency", createAgent: "Create checkout agent", agencyName: "Agency name", workspaceId: "HigherPays workspace ID",
    agentName: "Agent name", agentId: "HigherPays chatter / agent ID", agency: "Agency", agent: "Checkout agent",
    chooseAgency: "Choose an agency", chooseCreator: "Choose a creator",
    workspaceHelp: "Find this ID in HigherPays: open the correct workspace and copy its workspace ID from its settings or workspace details. It decides which HigherPays workspace receives this marketplace's checkout activity.",
    agentHelp: "Use the HigherPays account ID for the synthetic Marketplace chatter/agent created for this marketplace. Then set it as the checkout agent below. It attributes marketplace purchases to that account.",
    attributionTitle: "Use the synthetic Marketplace attribution account", attributionHelp: "Do not enter a customer Telegram ID or a real creator account ID here. Marketplace checkouts must use the dedicated synthetic Marketplace creator/chatter account configured in HigherPays.",
    secretWarning: "Never paste payment keys, API keys, wallet details, or other payment secrets into these fields. Payment credentials stay only in the server environment.",
    setupEmpty: "Start here: create an agency with its HigherPays workspace ID, then add the synthetic Marketplace checkout agent and select it.",
    agencyEmpty: "No agencies yet.", agentEmpty: "No checkout agents yet.", setCheckoutAgent: "Use for checkout", checkoutAgentSet: "{name} is now the checkout agent.",
    creatorCatalogue: "Creator catalogue", catalogueHelp: "This is the same catalogue grid customers see. Draft creators remain visible only to administrators.", creatorEmpty: "No creators yet. Add the first verified creator to begin building the catalogue.",
    addCreator: "Add creator", newCreator: "Add creator to catalogue", creatorName: "Creator display name", creatorSlug: "Creator URL slug", creatorBio: "Biography", approvingAdmin: "Approving administrator",
    rightsHelp: "By creating this creator, you confirm the creator is an adult and you are authorized to distribute this content.", createCreator: "Create creator", creatorCreated: "Creator created.", publish: "Publish", published: "Published", draft: "Draft",
    content: "Content", backToCatalogue: "Back to catalogue", contentHelp: "Add delivery files and a safe preview here. Customers only see published products and blurred previews.", contentEmpty: "No content yet. Add the first item for this creator.", addContent: "Add content", newContent: "Add content",
    productTitle: "Product title", productSlug: "Product URL slug", description: "Description", price: "Price (for example, 9.99)", currency: "Currency", preview: "Storefront preview", noPreview: "No preview available", privateFiles: "Private delivery files", selectPrivateFiles: "Select at least one private delivery file.",
    createProduct: "Create product", productCreated: "Product saved.", uploadMedia: "Upload media", uploadPurpose: "This file is for", deliveryFile: "Private delivery", previewFile: "Blurred storefront preview", chooseFile: "Choose file", upload: "Upload file", uploadHelp: "Upload the private delivery file separately from a safe preview. Private files are never exposed in the Mini App. Telegram delivery is limited to 50 MB per file.",
    mediaUploaded: "Media uploaded.", uploadFailed: "Could not upload the media.", mediaLimit: "Telegram delivery is limited to 50 MB per uploaded file.", noMedia: "No uploaded media is ready for this agency.", noCreators: "Create a creator before adding content.", selectFiles: "Select uploaded private files to continue.", priceMinimum: "Set a price of at least 3.00.", loading: "Loading catalogue…", requestFailed: "Something went wrong. Please try again.", invalidCredentials: "The password is incorrect.", signInFailed: "Could not sign in.", close: "Close", privateDelivery: "Private delivery", storefrontPreview: "Storefront preview", status: "Status", media: "Media", required: "Required",
  },
  he: {
    language: "שפה", english: "English", hebrew: "עברית", signIn: "כניסת מנהל", password: "סיסמה",
    adminTitle: "ניהול המרקטפלייס", catalogue: "קטלוג", setup: "הגדרת סביבת עבודה", signOut: "התנתקות",
    save: "שמירה", saved: "נשמר.", saveFailed: "לא ניתן לשמור את השינויים.",
    createAgency: "יצירת סוכנות", createAgent: "יצירת סוכן תשלום", agencyName: "שם הסוכנות", workspaceId: "מזהה סביבת עבודה ב-HigherPays",
    agentName: "שם הסוכן", agentId: "מזהה צ'אטר / סוכן ב-HigherPays", agency: "סוכנות", agent: "סוכן תשלום",
    chooseAgency: "בחירת סוכנות", chooseCreator: "בחירת יוצר/ת",
    workspaceHelp: "אפשר למצוא את המזהה ב-HigherPays: נכנסים לסביבת העבודה הנכונה ומעתיקים את מזהה סביבת העבודה מההגדרות או מפרטי סביבת העבודה. הוא קובע לאיזו סביבת עבודה ישויכו פעולות התשלום במרקטפלייס.",
    agentHelp: "יש להשתמש במזהה החשבון של הצ'אטר/הסוכן הסינתטי Marketplace שהוגדר עבור המרקטפלייס. לאחר מכן יש לבחור בו כסוכן התשלום. הוא משייך אליו רכישות מהמרקטפלייס.",
    attributionTitle: "יש להשתמש בחשבון השיוך הסינתטי Marketplace", attributionHelp: "אין להזין כאן מזהה טלגרם של לקוח או מזהה של חשבון יוצר/ת אמיתי/ת. תשלומים מהמרקטפלייס חייבים להשתמש בחשבון היוצר/צ'אטר הסינתטי הייעודי Marketplace שמוגדר ב-HigherPays.",
    secretWarning: "לעולם אין להדביק בשדות האלה מפתחות תשלום, מפתחות API, פרטי ארנק או סודות תשלום אחרים. פרטי תשלום נשמרים רק בסביבת השרת.",
    setupEmpty: "מתחילים כאן: יוצרים סוכנות עם מזהה סביבת העבודה ב-HigherPays, מוסיפים את סוכן התשלום הסינתטי Marketplace ובוחרים בו.",
    agencyEmpty: "עדיין אין סוכנויות.", agentEmpty: "עדיין אין סוכני תשלום.", setCheckoutAgent: "הגדרה לתשלום", checkoutAgentSet: "{name} הוגדר כסוכן התשלום.",
    creatorCatalogue: "קטלוג יוצרים", catalogueHelp: "זהו אותו גריד קטלוג שהלקוחות רואים. יוצרים בטיוטה מוצגים רק למנהלים.", creatorEmpty: "עדיין אין יוצרים. הוסיפו את היוצר/ת המאומת/ת הראשון/ה כדי להתחיל לבנות את הקטלוג.",
    addCreator: "הוספת יוצר/ת", newCreator: "הוספת יוצר/ת לקטלוג", creatorName: "שם תצוגה של היוצר/ת", creatorSlug: "סיומת כתובת של היוצר/ת", creatorBio: "ביוגרפיה", approvingAdmin: "מנהל/ת מאשר/ת",
    rightsHelp: "ביצירת היוצר/ת אתם מאשרים שהיוצר/ת בגיר/ה ושיש לכם הרשאה להפיץ את התוכן.", createCreator: "יצירת יוצר/ת", creatorCreated: "היוצר/ת נוצר/ה.", publish: "פרסום", published: "פורסם", draft: "טיוטה",
    content: "תוכן", backToCatalogue: "חזרה לקטלוג", contentHelp: "כאן מוסיפים קובצי מסירה ותצוגה מקדימה בטוחה. לקוחות רואים רק מוצרים שפורסמו ותצוגות מקדימות מטושטשות.", contentEmpty: "עדיין אין תוכן. הוסיפו את הפריט הראשון עבור היוצר/ת.", addContent: "הוספת תוכן", newContent: "הוספת תוכן",
    productTitle: "כותרת המוצר", productSlug: "סיומת כתובת של המוצר", description: "תיאור", price: "מחיר (לדוגמה, 9.99)", currency: "מטבע", preview: "תצוגה מקדימה בחנות", noPreview: "ללא תצוגה מקדימה", privateFiles: "קבצים למסירה פרטית", selectPrivateFiles: "יש לבחור לפחות קובץ אחד למסירה פרטית.",
    createProduct: "יצירת מוצר", productCreated: "המוצר נשמר.", uploadMedia: "העלאת מדיה", uploadPurpose: "קובץ זה מיועד ל", deliveryFile: "מסירה פרטית", previewFile: "תצוגה מקדימה מטושטשת בחנות", chooseFile: "בחירת קובץ", upload: "העלאת קובץ", uploadHelp: "יש להעלות את קובץ המסירה הפרטית בנפרד מתצוגה מקדימה בטוחה. קבצים פרטיים אינם חשופים באפליקציית המיני. מסירה בטלגרם מוגבלת ל-50 מ״ב לכל קובץ.",
    mediaUploaded: "המדיה הועלתה.", uploadFailed: "לא ניתן להעלות את המדיה.", mediaLimit: "מסירה בטלגרם מוגבלת ל-50 מ״ב לכל קובץ שהועלה.", noMedia: "אין מדיה מוכנה עבור הסוכנות הזו.", noCreators: "יש ליצור יוצר/ת לפני הוספת תוכן.", selectFiles: "יש לבחור קבצים פרטיים שהועלו כדי להמשיך.", priceMinimum: "יש להגדיר מחיר של לפחות 3.00.", loading: "טוען קטלוג…", requestFailed: "משהו השתבש. נסו שוב.", invalidCredentials: "הסיסמה שגויה.", signInFailed: "לא ניתן להתחבר.", close: "סגירה", privateDelivery: "מסירה פרטית", storefrontPreview: "תצוגה מקדימה בחנות", status: "סטטוס", media: "מדיה", required: "חובה",
  },
};

export function adminDirection(language: AdminLanguage) {
  return language === "he" ? "rtl" : "ltr";
}

export function adminLanguage(value: string | null): AdminLanguage {
  return value === "he" ? "he" : "en";
}
