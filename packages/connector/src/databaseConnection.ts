import type { RowService } from "./rowService.js";
import type { SchemaService } from "./schemaService.js";

/** One open database. */
export interface DatabaseConnection {
  /** What the editor calls the database in its bar: its name, a file name, a server and a database. */
  readonly caption: string;
  readonly schemaService: SchemaService;
  readonly rowService: RowService;

  /** Closes it once the calls in flight have settled; a call afterwards refuses "connection-closed". Idempotent. */
  close(): Promise<void>;
}
