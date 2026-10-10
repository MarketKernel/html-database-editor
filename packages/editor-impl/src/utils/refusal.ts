// What the user reads of a refusal: the plugin's own message; a bug's text never shown.

/** A refusal of the contract's shape: a plain object with a kind and a message for the user. */
export interface Refusal {
  readonly kind: string;
  readonly message: string;
}

export const isRefusal = (error: unknown): error is Refusal =>
  typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string" && "message" in error && typeof error.message === "string";

/** The refusal's message; for anything else, a neutral line, the error left in the console for whoever debugs it. */
export const describeFailure = (error: unknown, console: Console): string => {
  if (isRefusal(error)) return error.message;
  console.error(error);
  return "Something went wrong; the browser's console has the details";
};
