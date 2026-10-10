/** What the referencing panel tells the screen. */
export interface ReferencingPanelObserver {
  /** A tab was chosen, by ReferencingTabView#tabId. */
  chooseTab(tabId: string): void;
}
