export function stripUrlQuotes(url) {
  return String(url || "").trim().replace(/^['"]|['"]$/g, "");
}

export function getGoogleDriveFileId(url) {
  const raw = stripUrlQuotes(url);
  if (!raw) return "";

  const fileMatch = raw.match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  if (fileMatch?.[1]) return fileMatch[1];

  const idMatch = raw.match(/[?&]id=([^&#]+)/);
  if (raw.includes("drive.google.com") && idMatch?.[1]) return idMatch[1];

  return "";
}

export function normalizeImageUrl(url) {
  const raw = stripUrlQuotes(url);
  if (!raw) return "";

  const driveId = getGoogleDriveFileId(raw);

  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${driveId}=w1000`;
  }

  return raw;
}

export function googleDrivePdfUrl(url) {
  const raw = stripUrlQuotes(url);
  if (!raw) return "";

  const driveId = getGoogleDriveFileId(raw);

  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${driveId}=w1000`;
  }

  return raw;
}

export async function imageToDataURL(url) {
  if (!url) return null;

  url = googleDrivePdfUrl(url);

  if (url.startsWith("data:image")) return url;

  try {
    const img = new Image();

    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;

      img.src =
        url +
        (url.includes("?") ? "&" : "?") +
        "cb=" +
        Date.now();
    });

    const canvas = document.createElement("canvas");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    canvas
      .getContext("2d")
      .drawImage(img, 0, 0);

    return canvas.toDataURL("image/png");
  } catch {}

  try {
    const blob = await fetch(url, {
      mode: "cors",
      cache: "no-store",
    }).then((r) => r.blob());

    return await new Promise((resolve, reject) => {
      const r = new FileReader();

      r.onload = () => resolve(r.result);
      r.onerror = reject;

      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();

    r.onload = () => resolve(r.result);
    r.onerror = reject;

    r.readAsDataURL(file);
  });
}

export const pdfColor = (hex) => {
  const n = hex.replace("#", "");

  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
};