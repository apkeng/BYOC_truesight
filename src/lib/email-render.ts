import type { EmailAttachment } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Renders a plain-text email body plus its template's link/poster attachments into the HTML sent to recipients. */
export function buildEmailHtml(body: string, attachments: EmailAttachment[] = []): string {
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");
  const links = attachments.filter((a) => a.type === "link");
  const posters = attachments.filter((a) => a.type === "poster");

  const linksHtml = links.length
    ? `<div style="margin-top:24px">${links
        .map(
          (l) =>
            `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:4px 8px 4px 0;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px">${escapeHtml(l.name)}</a>`
        )
        .join("")}</div>`
    : "";

  const postersHtml = posters.length
    ? `<div style="margin-top:24px">${posters
        .map(
          (p) =>
            `<img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.name)}" style="max-width:100%;display:block;margin:8px 0;border-radius:8px" />`
        )
        .join("")}</div>`
    : "";

  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111827">${bodyHtml}${linksHtml}${postersHtml}</div>`;
}

/** Poster attachments as real Resend file attachments, fetched by Resend from their public storage URL. */
export function buildResendAttachments(attachments: EmailAttachment[] = []) {
  return attachments
    .filter((a) => a.type === "poster")
    .map((a) => ({ filename: a.name || "poster", path: a.url }));
}
