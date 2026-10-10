/** One line of what happened, shown for a while at the bottom of the page. */
export interface Notifier {
  showInfo(message: string): void;
  showError(message: string): void;
}

export type NotifierFactory = (document: Document) => Notifier;
