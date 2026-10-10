/** Told by the database screen when the user closes the database. */
export interface DatabaseCloseObserver {
  /** The app closes the connection and shows the start screen. */
  closeDatabase(): void;
}
