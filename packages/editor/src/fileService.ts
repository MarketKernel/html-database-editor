import type { PickedFile } from "./models/pickedFile.js";

/** Files from and to the user's disk: picked by the browser's picker, saved by its picker or as a download. */
export interface FileService {
  /** null: no file picked. accept: ".sqlite,.db" or "*". */
  pickFile(accept: string): Promise<PickedFile | null>;
  /** Saves the bytes under the suggested name; false: the user cancelled. */
  saveFile(suggestedName: string, bytes: Uint8Array): Promise<boolean>;
}

export type FileServiceFactory = (document: Document) => FileService;
