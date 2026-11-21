import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiFile } from '@/api/client';

/**
 * Gets a document's PDF from the server and opens the phone's share sheet with it (WhatsApp, email, save to files…).
 * `path` is the API route (e.g. /quotations/:id/pdf); `filename` is what the receiver sees; `title` heads the sheet.
 * Throws the server's words when it refuses (e.g. too many PDFs in a minute).
 */
export async function sharePdf(path: string, filename: string, title: string): Promise<void> {
  const bytes = await apiFile(path);
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(new Uint8Array(bytes));
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
}
