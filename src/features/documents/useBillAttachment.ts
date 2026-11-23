import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { apiUpload, type UploadedFile } from '@/api/client';

/** A scanned bill already saved on a document (as the upload route returns it, or just its link). */
export type SavedBill = { filename?: string; originalName?: string; path?: string; url?: string };

/** The saved bill of a document, from its billAttachmentUrl / attachmentPaths (or null). */
export function savedBillFrom(billAttachmentUrl?: string | null, attachmentPaths?: unknown): SavedBill | null {
  if (!billAttachmentUrl) return null;
  if (Array.isArray(attachmentPaths) && attachmentPaths[0]) return attachmentPaths[0] as SavedBill;
  const name = billAttachmentUrl.split('/').pop() || 'scanned-bill';
  return { filename: name, originalName: name, path: billAttachmentUrl, url: billAttachmentUrl };
}

/** A photo taken or picked on the phone, waiting to upload when the document is saved. */
export type PickedBill = { uri: string; name: string; mimeType: string; size?: number };

/** The most a bill may be (the server's own limit). */
const MAX_MB = 25;

/**
 * The "Attach Scanned Bill" state of the GRN (and Purchase) form: a photo taken with the camera or picked from the
 * gallery is uploaded only when the document is saved; a bill already on the document (or taken from the Purchase a
 * GRN is made from, with `source` naming it) is kept unless replaced or removed.
 */
export function useBillAttachment() {
  const [picked, setPicked] = useState<PickedBill | null>(null);
  const [existing, setExistingState] = useState<SavedBill | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const take = (asset: ImagePicker.ImagePickerAsset): string | null => {
    if (asset.fileSize && asset.fileSize > MAX_MB * 1024 * 1024) return `File size exceeds the ${MAX_MB}MB limit.`;
    const mimeType = asset.mimeType || 'image/jpeg';
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    setPicked({ uri: asset.uri, name: asset.fileName || `bill-${Date.now()}.${ext}`, mimeType, size: asset.fileSize });
    setExistingState(null);
    setSource(null);
    return null;
  };

  /** Opens the camera; returns a message when it can't be used (no permission, too large), else null. */
  const fromCamera = async (): Promise<string | null> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'Allow the camera in your phone settings to photograph a bill.';
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    return result.canceled || !result.assets[0] ? null : take(result.assets[0]);
  };

  /** Opens the photo gallery; same answer as fromCamera. */
  const fromGallery = async (): Promise<string | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return 'Allow photos in your phone settings to attach a bill.';
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    return result.canceled || !result.assets[0] ? null : take(result.assets[0]);
  };

  const remove = useCallback(() => {
    setPicked(null);
    setExistingState(null);
    setSource(null);
  }, []);

  /** Shows a bill already saved (on this document, or on the document it is made from). */
  const setExisting = useCallback((bill: SavedBill | null, from?: string | null) => {
    setExistingState(bill);
    setSource(bill ? from ?? null : null);
    if (bill) setPicked(null);
  }, []);

  /** On save: uploads a picked photo, or keeps the existing bill. What to send with the document. */
  const upload = async (): Promise<{ billAttachmentUrl: string | null; attachmentPaths?: (UploadedFile | SavedBill)[] }> => {
    if (picked) {
      const saved = await apiUpload(picked);
      return { billAttachmentUrl: saved.path, attachmentPaths: [saved] };
    }
    if (existing) return { billAttachmentUrl: existing.path || existing.url || null, attachmentPaths: [existing] };
    return { billAttachmentUrl: null };
  };

  return { picked, existing, source, fromCamera, fromGallery, remove, setExisting, upload };
}

export type BillAttachmentState = ReturnType<typeof useBillAttachment>;
