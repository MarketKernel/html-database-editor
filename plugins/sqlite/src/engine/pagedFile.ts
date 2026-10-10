// A file as SQLite's VFS sees it: read from its source slice by slice as asked, never whole,
// every chunk written held in memory until the changes are taken and the written file becomes the source.

import { asRollbackJournalFile } from "./memoryDatabase.js";

/** SQLite's largest page: a page never straddles two chunks. */
const CHUNK_BYTES = 65536;

/** Reads the bytes [start, end) of the file at once: FileReaderSync in the worker. Throws the browser's DOMException. */
export type FileSliceReader = (file: Blob, start: number, end: number) => Uint8Array;

/** A run of written bytes at its place in the file. */
export interface FileChunk {
  readonly position: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** What is to be written into the source for it to hold the file: the chunks in file order, then the size to cut it to. */
export interface FileChanges {
  readonly chunks: readonly FileChunk[];
  readonly sizeBytes: number;
}

// why: a unit LinkedFileVfs holds, kept in this -impl without a contract: a deviation recorded in ARCHITECTURE.md.
export interface PagedFile {
  readonly sizeBytes: number;
  /** Fills the target from the position; answers how many bytes the file had there, fewer at its end. Throws the reader's DOMException. */
  readInto(target: Uint8Array, position: number): number;
  write(data: Uint8Array, position: number): void;
  /** Cuts the file to the size, or grows it with zeros. */
  truncate(sizeBytes: number): void;
  /** null: nothing written since the source was set. */
  obtainChanges(): FileChanges | null;
  /** The file as written: read from it from now on, the chunks held so far forgotten. */
  setSource(file: Blob): void;
}

/** A file over the source; with none, a file in memory alone, empty at first: a journal. */
export const createPagedFile = (source: Blob | null, readSlice: FileSliceReader): PagedFile => new BlobPagedFile(source, readSlice);

class BlobPagedFile {
  private readonly chunks = new Map<number, Uint8Array<ArrayBuffer>>();
  private sourceSizeBytes: number;
  /** The source's bytes past a cut read as zeros, though the source still has them. */
  private sourceLimit: number;
  sizeBytes: number;

  constructor(
    private source: Blob | null,
    private readonly readSlice: FileSliceReader,
  ) {
    this.sourceSizeBytes = source?.size ?? 0;
    this.sourceLimit = this.sourceSizeBytes;
    this.sizeBytes = this.sourceSizeBytes;
  }

  readInto(target: Uint8Array, position: number): number {
    const end = Math.min(position + target.length, this.sizeBytes);
    let cursor = position;
    while (cursor < end) {
      const index = chunkIndex(cursor);
      const chunk = this.chunks.get(index);
      if (chunk !== undefined) {
        const chunkEnd = Math.min(chunkStart(index + 1), end);
        target.set(chunk.subarray(cursor - chunkStart(index), chunkEnd - chunkStart(index)), cursor - position);
        cursor = chunkEnd;
        continue;
      }
      // The chunks never written in a row are one read of the source.
      let runEnd = Math.min(chunkStart(index + 1), end);
      while (runEnd < end && !this.chunks.has(chunkIndex(runEnd))) runEnd = Math.min(runEnd + CHUNK_BYTES, end);
      target.set(this.readSource(cursor, runEnd), cursor - position);
      cursor = runEnd;
    }
    return Math.max(0, end - position);
  }

  write(data: Uint8Array, position: number): void {
    const end = position + data.length;
    let cursor = position;
    while (cursor < end) {
      const index = chunkIndex(cursor);
      const chunkEnd = Math.min(chunkStart(index + 1), end);
      this.writableChunk(index).set(data.subarray(cursor - position, chunkEnd - position), cursor - chunkStart(index));
      cursor = chunkEnd;
    }
    this.sizeBytes = Math.max(this.sizeBytes, end);
  }

  truncate(sizeBytes: number): void {
    for (const index of [...this.chunks.keys()]) {
      if (chunkStart(index) >= sizeBytes) this.chunks.delete(index);
    }
    this.chunks.get(chunkIndex(sizeBytes))?.fill(0, sizeBytes - chunkStart(chunkIndex(sizeBytes)));
    this.sourceLimit = Math.min(this.sourceLimit, sizeBytes);
    this.sizeBytes = sizeBytes;
  }

  obtainChanges(): FileChanges | null {
    if (this.chunks.size === 0 && this.sizeBytes === this.sourceSizeBytes) return null;
    const chunks = [...this.chunks.entries()]
      .sort(([first], [second]) => first - second)
      .map(([index, bytes]) => ({ position: chunkStart(index), bytes: bytes.subarray(0, Math.min(CHUNK_BYTES, this.sizeBytes - chunkStart(index))) }));
    return { chunks, sizeBytes: this.sizeBytes };
  }

  setSource(file: Blob): void {
    this.source = file;
    this.sourceSizeBytes = file.size;
    this.sourceLimit = file.size;
    this.sizeBytes = file.size;
    this.chunks.clear();
  }

  /** The chunk to write into, read from the source the first time. */
  private writableChunk(index: number): Uint8Array<ArrayBuffer> {
    const existing = this.chunks.get(index);
    if (existing !== undefined) return existing;
    const chunk = new Uint8Array(CHUNK_BYTES);
    const readEnd = Math.min(chunkStart(index + 1), this.sizeBytes);
    if (readEnd > chunkStart(index)) chunk.set(this.readSource(chunkStart(index), readEnd));
    this.chunks.set(index, chunk);
    return chunk;
  }

  /** The source's bytes, zeros past its limit; a WAL header reads as a rollback journal's, which this VFS keeps. */
  private readSource(start: number, end: number): Uint8Array {
    const bytes = new Uint8Array(end - start);
    const readEnd = Math.min(end, this.sourceLimit);
    if (this.source !== null && start < readEnd) bytes.set(this.readSlice(this.source, start, readEnd));
    return start === 0 ? asRollbackJournalFile(bytes) : bytes;
  }
}

const chunkIndex = (position: number): number => Math.floor(position / CHUNK_BYTES);

const chunkStart = (index: number): number => index * CHUNK_BYTES;
