/** A file the user picked or dropped. */
export interface PickedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}
