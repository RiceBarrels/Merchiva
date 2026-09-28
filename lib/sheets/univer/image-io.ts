// Univer's image store, pointed at our uploads (sheets.md §9.6): an image a user inserts into a sheet (floating
// drawing or cell image) is uploaded like a Docs image (UploadThing, lib/docs/uploads.ts) and saved as its
// hosted URL, never as base64 in the snapshot. The URL is on an allowed image host, so it survives the
// sanitizer every viewer runs (lib/sheets/sanitize.ts). Replaces Univer's ImageIoService through the drawing
// plugin's `override` (presets.ts).

import {
  ImageSourceType, ImageUploadStatusType, generateRandomId,
  type IImageIoService, type IImageIoServiceParam, type Nullable,
} from "@univerjs/presets";
import { Subject } from "rxjs";
import { uploadDocImage, validateDocImage } from "@/lib/docs/uploads";

export class MerchivaImageIoService implements IImageIoService {
  private waitCount = 0;
  private readonly changes = new Subject<number>();
  readonly change$ = this.changes.asObservable();
  private readonly cache = new Map<string, HTMLImageElement>();

  setWaitCount(count: number): void {
    this.waitCount = count;
    this.changes.next(count);
  }

  getImageSourceCache(source: string): Nullable<HTMLImageElement> {
    return this.cache.get(source);
  }

  addImageSourceCache(source: string, _imageSourceType: ImageSourceType, imageSource: Nullable<HTMLImageElement>): void {
    if (imageSource) this.cache.set(source, imageSource);
  }

  async getImage(imageId: string): Promise<string> {
    return imageId;
  }

  /** Rejects with an Error whose message is an ImageUploadStatusType code, as Univer's own service does. */
  async saveImage(imageFile: File): Promise<Nullable<IImageIoServiceParam>> {
    try {
      const problem = validateDocImage(imageFile);
      if (problem === "unsupported") throw new Error(ImageUploadStatusType.ERROR_IMAGE_TYPE);
      if (problem === "tooLarge") throw new Error(ImageUploadStatusType.ERROR_EXCEED_SIZE);
      let url: string;
      try {
        url = await uploadDocImage(imageFile);
      } catch {
        throw new Error(ImageUploadStatusType.ERROR_IMAGE);
      }
      return {
        imageId: generateRandomId(6),
        imageSourceType: ImageSourceType.URL,
        source: url,
        base64Cache: url,
        status: ImageUploadStatusType.SUCCUSS,
      };
    } finally {
      this.waitCount = Math.max(0, this.waitCount - 1);
      this.changes.next(this.waitCount);
    }
  }
}
