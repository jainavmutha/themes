export const DEFAULT_LOGO_URL =
  import.meta.env.VITE_DEFAULT_LOGO_URL ||
  "https://drive.google.com/uc?export=view&id=1zPOSv3lHBukCB7QtZrD-oc3j8T8YxbYx";

export const DEFAULT_SIGNATURE_URL =
  import.meta.env.VITE_DEFAULT_SIGNATURE_URL ||
  "https://drive.google.com/uc?export=view&id=1w4OXKhD37BWQfAit1zOTBGlHK1YpfZqn";

export const DEFAULT_PAYMENT_QR_URL =
  import.meta.env.VITE_DEFAULT_PAYMENT_QR_URL ||
  "https://drive.google.com/uc?export=view&id=1fCy8MlBWYX2SrOpe52FQ4EIDo777nP4s";

export const DEFAULT_PAYMENT_UPI_ID =
  import.meta.env.VITE_DEFAULT_PAYMENT_UPI_ID || "";

export function createBrand({ normalizeImageUrl }) {
  return {
    primary: "#B70766",
    primaryDark: "#2E2E2E",
    accent: "#007E7C",

    header: "#F5EBDD",
    grid: "#E8E0D8",
    text: "#2B2A29",
    muted: "#6B6B6B",
    border: "#D6CFC9",

    logoUrl: normalizeImageUrl(DEFAULT_LOGO_URL),

    companyName: "Themes Furnishings & Decor",
    pdfCompanyName: "Themes Furnishings & Decor",

    website: "[www.themesfurnishings.com](https://www.themesfurnishings.com)",
    phone: "+91 9890299404",
    email: "themesfurnishings@hotmail.com",
    address: "141 MG Road, Pune 411040",
    gstin: "GSTIN: 27AAACT1234F1Z5",

    paymentQrUrl: normalizeImageUrl(DEFAULT_PAYMENT_QR_URL),
    paymentUpiId: DEFAULT_PAYMENT_UPI_ID,

    bankAccountName: "Themes Furnishings & Decor",
    bankName: "HDFC BANK",
    bankBranch: "Pune Branch",
    bankAddress: "Boat Club Road, Pune 411001",
    bankAccountNumber: "50200047416320",
    bankIfsc: "HDFC0000039",
  };
}