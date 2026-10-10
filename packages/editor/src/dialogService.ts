/** The page's own modal dialogs, in place of confirm() and prompt(). */
export interface DialogService {
  /** true: the user agreed. */
  confirm(title: string, message: string, actionCaption: string, isDangerous: boolean): Promise<boolean>;
  /** The text entered; null: cancelled. */
  prompt(title: string, label: string, initialValue: string): Promise<string | null>;
  /** Shows a long text to read and copy: a statement, a plan. */
  showText(title: string, text: string): Promise<void>;
}

export type DialogServiceFactory = (document: Document) => DialogService;
