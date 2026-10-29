export type AdminLanguage = "en" | "he";

type AdminCopy = {
  language: string; english: string; hebrew: string; signIn: string; password: string;
  adminTitle: string; catalogue: string; orders: string; revenue: string; setup: string; signOut: string; save: string;
  saved: string; saveFailed: string; createAgency: string;
  agencyName: string;
  agency: string; chooseAgency: string; chooseCreator: string;
  attributionTitle: string; attributionHelp: string;
  secretWarning: string; setupEmpty: string; agencyEmpty: string;
  creatorCatalogue: string;
  catalogueHelp: string; creatorEmpty: string; addCreator: string; newCreator: string;
  creatorName: string; creatorSlug: string; creatorBio: string; approvingAdmin: string;
  createCreator: string; creatorCreated: string; publish: string;
  published: string; draft: string; content: string; backToCatalogue: string;
  contentHelp: string; contentEmpty: string; addContent: string; newContent: string;
  productTitle: string; deliveryMessage: string; description: string; price: string;
  currency: string; preview: string; noPreview: string; privateFiles: string;
  selectPrivateFiles: string; createProduct: string; productCreated: string;
  uploadMedia: string; uploadPurpose: string; deliveryFile: string; previewFile: string;
  chooseFile: string; upload: string; uploadHelp: string; mediaUploaded: string;
  uploadFailed: string; mediaLimit: string; noMedia: string; noCreators: string;
  selectFiles: string; priceMinimum: string; loading: string; requestFailed: string;
  invalidCredentials: string; signInFailed: string; close: string; privateDelivery: string;
  storefrontPreview: string; status: string; media: string; required: string;
  editContent: string; edit: string; archive: string; categories: string; categoryName: string;
  categorySlug: string; createCategory: string; noPreviewOption: string; blurredPreviewOption: string;
  visiblePreviewOption: string; deliveryOrder: string; mediaTypeImage: string; mediaTypeVideo: string;
  selected: string; previousPage: string; nextPage: string; noPreviewMedia: string;
  // Orders
  ordersTitle: string; noOrders: string; filterAll: string; date: string; customer: string;
  items: string; total: string; payment: string; fulfillment: string; orderId: string;
  // Revenue
  revenueTitle: string; totalRevenue: string; todayRevenue: string; monthRevenue: string;
  paidOrders: string; pendingOrders: string; expiredOrders: string;
  creatorRevenue: string; purchases: string; noSalesYet: string;
};

export const adminCopy: Record<AdminLanguage, AdminCopy> = {
  en: {
    language: "Language", english: "English", hebrew: "עברית", signIn: "Administrator sign in", password: "Password",
    adminTitle: "Administration", catalogue: "Catalogue", orders: "Orders", revenue: "Revenue", setup: "Setup", signOut: "Sign out",
    save: "Save", saved: "Saved.", saveFailed: "Could not save your changes.",
    createAgency: "Create agency", agencyName: "Agency name",
    agency: "Agency",
    chooseAgency: "Choose an agency", chooseCreator: "Choose a creator",
    attributionTitle: "Payment integration", attributionHelp: "Payment is handled directly via MantaPay. Credentials are configured on the server.",
    secretWarning: "Never paste payment keys, API keys, wallet details, or other payment secrets into these fields. Payment credentials stay only in the server environment.",
    setupEmpty: "Start here: create an agency, then add creators and content.",
    agencyEmpty: "No agencies yet.",
    creatorCatalogue: "Creator catalogue", catalogueHelp: "This is the same catalogue grid customers see. Draft creators remain visible only to administrators.", creatorEmpty: "No creators yet. Add the first verified creator to begin building the catalogue.",
    addCreator: "Add creator", newCreator: "Add creator to catalogue", creatorName: "Creator display name", creatorSlug: "Creator URL slug", creatorBio: "Biography", approvingAdmin: "Approving administrator",
    createCreator: "Create creator", creatorCreated: "Creator created.", publish: "Publish", published: "Published", draft: "Draft",
    content: "Content", backToCatalogue: "Back to catalogue", contentHelp: "Add delivery files and a safe preview here. Customers only see published products and blurred previews.", contentEmpty: "No content yet. Add the first item for this creator.", addContent: "Add content", newContent: "Add content",
    productTitle: "Product title", deliveryMessage: "Message the customer receives with the video (optional)", description: "Description", price: "Price in EUR (for example, 9.99)", currency: "Currency", preview: "Storefront preview", noPreview: "No preview available", privateFiles: "Private delivery files", selectPrivateFiles: "Select at least one private delivery file.",
    createProduct: "Create product", productCreated: "Product saved.", uploadMedia: "Upload media", uploadPurpose: "This file is for", deliveryFile: "Private delivery", previewFile: "Blurred storefront preview", chooseFile: "Choose file", upload: "Upload file", uploadHelp: "Upload the private delivery file separately from a safe preview. Private files are never exposed in the Mini App. Telegram delivery is limited to 50 MB per file.",
    mediaUploaded: "Media uploaded.", uploadFailed: "Could not upload the media.", mediaLimit: "Telegram delivery is limited to 50 MB per uploaded file.", noMedia: "No uploaded media is ready for this agency.", noCreators: "Create a creator before adding content.", selectFiles: "Select uploaded private files to continue.", priceMinimum: "Set a price of at least 3.00.", loading: "Loading catalogue…", requestFailed: "Something went wrong. Please try again.", invalidCredentials: "The password is incorrect.", signInFailed: "Could not sign in.", close: "Close", privateDelivery: "Private delivery", storefrontPreview: "Storefront preview", status: "Status", media: "Media", required: "Required", editContent: "Edit content", edit: "Edit", archive: "Archive", categories: "Categories", categoryName: "Category name", categorySlug: "Category slug", createCategory: "Create category", noPreviewOption: "No preview", blurredPreviewOption: "Blurred preview", visiblePreviewOption: "Visible preview", deliveryOrder: "Delivery order", mediaTypeImage: "Image", mediaTypeVideo: "Video", selected: "Selected", previousPage: "Previous", nextPage: "Next", noPreviewMedia: "No preview available",
    ordersTitle: "Orders", noOrders: "No orders found.", filterAll: "All", date: "Date", customer: "Customer", items: "Items", total: "Total", payment: "Payment", fulfillment: "Fulfillment", orderId: "Order ID",
    revenueTitle: "Revenue", totalRevenue: "Total revenue", todayRevenue: "Today", monthRevenue: "This month", paidOrders: "Paid orders", pendingOrders: "Pending", expiredOrders: "Expired", creatorRevenue: "Revenue by creator", purchases: "Purchases", noSalesYet: "No sales yet.",
  },
  he: {
    language: "שפה", english: "English", hebrew: "עברית", signIn: "כניסת מנהל", password: "סיסמה",
    adminTitle: "ניהול", catalogue: "קטלוג", orders: "הזמנות", revenue: "הכנסות", setup: "הגדרות", signOut: "התנתקות",
    save: "שמירה", saved: "נשמר.", saveFailed: "לא ניתן לשמור את השינויים.",
    createAgency: "יצירת סוכנות", agencyName: "שם הסוכנות",
    agency: "סוכנות",
    chooseAgency: "בחירת סוכנות", chooseCreator: "בחירת יוצר/ת",
    attributionTitle: "חיבור תשלומים", attributionHelp: "התשלומים מתבצעים ישירות דרך MantaPay. פרטי ההתחברות מוגדרים בשרת.",
    secretWarning: "לעולם אין להדביק בשדות האלה מפתחות תשלום, מפתחות API, פרטי ארנק או סודות תשלום אחרים. פרטי תשלום נשמרים רק בסביבת השרת.",
    setupEmpty: "מתחילים כאן: יוצרים סוכנות, ואז מוסיפים יוצרים ותוכן.",
    agencyEmpty: "עדיין אין סוכנויות.",
    creatorCatalogue: "קטלוג יוצרים", catalogueHelp: "זהו אותו גריד קטלוג שהלקוחות רואים. יוצרים בטיוטה מוצגים רק למנהלים.", creatorEmpty: "עדיין אין יוצרים. הוסיפו את היוצר/ת המאומת/ת הראשון/ה כדי להתחיל לבנות את הקטלוג.",
    addCreator: "הוספת יוצר/ת", newCreator: "הוספת יוצר/ת לקטלוג", creatorName: "שם תצוגה של היוצר/ת", creatorSlug: "סיומת כתובת של היוצר/ת", creatorBio: "ביוגרפיה", approvingAdmin: "מנהל/ת מאשר/ת",
    createCreator: "יצירת יוצר/ת", creatorCreated: "היוצר/ת נוצר/ה.", publish: "פרסום", published: "פורסם", draft: "טיוטה",
    content: "תוכן", backToCatalogue: "חזרה לקטלוג", contentHelp: "כאן מוסיפים קובצי מסירה ותצוגה מקדימה בטוחה. לקוחות רואים רק מוצרים שפורסמו ותצוגות מקדימות מטושטשות.", contentEmpty: "עדיין אין תוכן. הוסיפו את הפריט הראשון עבור היוצר/ת.", addContent: "הוספת תוכן", newContent: "הוספת תוכן",
    productTitle: "כותרת המוצר", deliveryMessage: "טקסט שהלקוח יקבל ביחד עם הסרטון (לא חובה)", description: "תיאור", price: "מחיר ב-EUR (לדוגמה, 9.99)", currency: "מטבע", preview: "תצוגה מקדימה בחנות", noPreview: "ללא תצוגה מקדימה", privateFiles: "קבצים למסירה פרטית", selectPrivateFiles: "יש לבחור לפחות קובץ אחד למסירה פרטית.",
    createProduct: "יצירת מוצר", productCreated: "המוצר נשמר.", uploadMedia: "העלאת מדיה", uploadPurpose: "קובץ זה מיועד ל", deliveryFile: "מסירה פרטית", previewFile: "תצוגה מקדימה מטושטשת בחנות", chooseFile: "בחירת קובץ", upload: "העלאת קובץ", uploadHelp: "יש להעלות את קובץ המסירה הפרטית בנפרד מתצוגה מקדימה בטוחה. קבצים פרטיים אינם חשופים באפליקציית המיני. מסירה בטלגרם מוגבלת ל-50 מ״ב לכל קובץ.",
    mediaUploaded: "המדיה הועלתה.", uploadFailed: "לא ניתן להעלות את המדיה.", mediaLimit: "מסירה בטלגרם מוגבלת ל-50 מ״ב לכל קובץ שהועלה.", noMedia: "אין מדיה מוכנה עבור הסוכנות הזו.", noCreators: "יש ליצור יוצר/ת לפני הוספת תוכן.", selectFiles: "יש לבחור קבצים פרטיים שהועלו כדי להמשיך.", priceMinimum: "יש להגדיר מחיר של לפחות 3.00.", loading: "טוען קטלוג…", requestFailed: "משהו השתבש. נסו שוב.", invalidCredentials: "הסיסמה שגויה.", signInFailed: "לא ניתן להתחבר.", close: "סגירה", privateDelivery: "מסירה פרטית", storefrontPreview: "תצוגה מקדימה בחנות", status: "סטטוס", media: "מדיה", required: "חובה", editContent: "עריכת תוכן", edit: "עריכה", archive: "העברה לארכיון", categories: "קטגוריות", categoryName: "שם קטגוריה", categorySlug: "סיומת קטגוריה", createCategory: "יצירת קטגוריה", noPreviewOption: "ללא תצוגה מקדימה", blurredPreviewOption: "תצוגה מקדימה מטושטשת", visiblePreviewOption: "תצוגה מקדימה גלויה", deliveryOrder: "סדר המסירה", mediaTypeImage: "תמונה", mediaTypeVideo: "סרטון", selected: "נבחר", previousPage: "הקודם", nextPage: "הבא", noPreviewMedia: "אין תצוגה מקדימה",
    ordersTitle: "הזמנות", noOrders: "לא נמצאו הזמנות.", filterAll: "הכל", date: "תאריך", customer: "לקוח/ה", items: "פריטים", total: "סה״כ", payment: "תשלום", fulfillment: "מסירה", orderId: "מזהה הזמנה",
    revenueTitle: "הכנסות", totalRevenue: "סה״כ הכנסות", todayRevenue: "היום", monthRevenue: "החודש", paidOrders: "הזמנות ששולמו", pendingOrders: "ממתינות", expiredOrders: "פגו תוקף", creatorRevenue: "הכנסות לפי יוצר/ת", purchases: "רכישות", noSalesYet: "עדיין אין מכירות.",
  },
};

export function adminDirection(language: AdminLanguage) {
  return language === "he" ? "rtl" : "ltr";
}

export function adminLanguage(value: string | null): AdminLanguage {
  return value === "he" ? "he" : "en";
}
