// The one place an EngineFailure is built outside a statement.

import type { EngineFailure } from "./engineMessages.js";
import type { EngineFailureKind } from "./engineMessages.js";

export const engineFailure = (kind: EngineFailureKind, message: string): EngineFailure => ({ kind, message, code: null, statementIndex: null });
