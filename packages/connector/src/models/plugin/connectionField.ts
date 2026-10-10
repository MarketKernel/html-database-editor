import type { ConnectionFieldKind } from "../simpleTypes/plugin/connectionFieldKind.js";

/** One parameter connect() takes. */
export interface ConnectionField {
  /** The key in ConnectionParameters. */
  readonly name: string;
  readonly caption: string;
  readonly kind: ConnectionFieldKind;
}
