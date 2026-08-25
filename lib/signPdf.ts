import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface SignatureBlock {
  /** e.g. "Employer" or "Candidate" — becomes the block heading */
  role: string
  /** Signer's legal name */
  name: string
  /** PNG bytes of the drawn signature */
  imageBytes: Uint8Array | ArrayBuffer
  /** ISO timestamp of the signing event */
  signedAt: string
  // THE SIGNER'S IP IS DELIBERATELY NOT ACCEPTED HERE, AND MUST NOT COME BACK.
  //
  // The OFFER is the contract — names, terms, signatures, dates — and it is
  // retained. The signer's IP is ANTI-FRAUD METADATA, NOT A CONTRACT TERM,
  // and nobody reading a job offer needs to see it.
  //
  // It still exists: offers.signature_ip and .employer_signature_ip are
  // written exactly as before. THE COLUMN IS THE POINT — a column can be
  // deleted on the twelve-month retention rule, and a line printed into a
  // retained PDF cannot. Printing it is what made the privacy policy's
  // promise unkeepable, so the promise stayed and the print went.
  //
  // It is removed from this interface rather than merely left unprinted so
  // that passing one is a COMPILER ERROR rather than a silent no-op.
  // Restoring it would be a decision about what a retained document says,
  // which is Paul's, not a tidy-up.
  //
  // Removed 25 Aug 2026, while zero offers existed, so nothing needed
  // remediating. That will not be true a second time.
  /** User-agent captured at signing time (audit trail). Optional. */
  userAgent?: string | null
}

/**
 * Appends a "certificate" page to the supplied PDF for each signature,
 * embedding the drawn signature image plus the audit metadata. Returns
 * the signed PDF bytes. Does not mutate the input.
 *
 * We deliberately append rather than try to overwrite an existing
 * signature line inside the AI-generated letter — coordinate-searching
 * inside a jsPDF-generated document is brittle and doesn't meaningfully
 * change the legal position (a signature with an audit trail is a valid
 * e-signature under the UK Electronic Communications Act 2000).
 */
export async function appendSignaturesToPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  signatures: SignatureBlock[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage()
  const { width, height } = page.getSize()
  const margin = 50

  // Header
  page.drawText('Signature Certificate', {
    x: margin, y: height - margin,
    size: 18, font: fontBold, color: rgb(0.06, 0.09, 0.16),
  })
  page.drawLine({
    start: { x: margin, y: height - margin - 10 },
    end: { x: width - margin, y: height - margin - 10 },
    thickness: 1, color: rgb(0.88, 0.9, 0.94),
  })

  let cursorY = height - margin - 40

  for (const sig of signatures) {
    // Section heading
    page.drawText(`${sig.role} Signature`, {
      x: margin, y: cursorY, size: 12, font: fontBold, color: rgb(0.39, 0.45, 0.55),
    })
    cursorY -= 22

    // Embed the signature image
    try {
      const pngImage = await pdfDoc.embedPng(sig.imageBytes)
      const maxW = 220
      const maxH = 70
      const scale = Math.min(maxW / pngImage.width, maxH / pngImage.height, 1)
      const imgW = pngImage.width * scale
      const imgH = pngImage.height * scale
      page.drawImage(pngImage, {
        x: margin,
        y: cursorY - imgH,
        width: imgW,
        height: imgH,
      })
      cursorY -= imgH + 8
    } catch (err) {
      // If the PNG fails to embed, fall back to text so the certificate
      // still renders rather than the whole document failing.
      page.drawText('[signature image could not be embedded]', {
        x: margin, y: cursorY, size: 10, font, color: rgb(0.72, 0.05, 0.11),
      })
      cursorY -= 20
    }

    // Signature line under the drawn sig
    page.drawLine({
      start: { x: margin, y: cursorY },
      end: { x: margin + 260, y: cursorY },
      thickness: 0.5, color: rgb(0.5, 0.55, 0.65),
    })
    cursorY -= 16

    const detail = (label: string, value: string) => {
      page.drawText(`${label}:`, {
        x: margin, y: cursorY, size: 9, font: fontBold, color: rgb(0.39, 0.45, 0.55),
      })
      page.drawText(value, {
        x: margin + 90, y: cursorY, size: 9, font, color: rgb(0.12, 0.15, 0.22),
      })
      cursorY -= 14
    }

    const signedAtPretty = (() => {
      try {
        return new Date(sig.signedAt).toLocaleString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
        })
      } catch { return sig.signedAt }
    })()

    detail('Name', sig.name)
    detail('Signed at', signedAtPretty)
    if (sig.userAgent) {
      // Trim the UA string so it fits on one line
      const ua = sig.userAgent.length > 90 ? `${sig.userAgent.slice(0, 87)}...` : sig.userAgent
      detail('Device', ua)
    }

    cursorY -= 20
  }

  // Footer
  page.drawText('This certificate forms a legally binding audit trail under the UK Electronic Communications Act 2000.', {
    x: margin, y: margin, size: 8, font, color: rgb(0.58, 0.64, 0.72),
  })

  return await pdfDoc.save()
}

/**
 * Convenience helper: fetches a Supabase signed URL, returns its bytes.
 * Use this before calling appendSignaturesToPdf when the source PDF
 * lives in Supabase Storage.
 */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Converts a base64 data URL (e.g. from a canvas signature) into raw
 * PNG bytes suitable for pdf-lib's embedPng.
 */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || ''
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}
