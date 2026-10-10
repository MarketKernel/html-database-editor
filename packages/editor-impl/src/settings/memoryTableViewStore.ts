// TableViewStore in memory, for as long as the database is open.

import type { TableName } from "@db-manager/connector";
import type { TableView } from "@db-manager/editor";
import type { TableViewStore } from "@db-manager/editor";
import type { TableViewStoreFactory } from "@db-manager/editor";

export const buildMemoryTableViewStore: TableViewStoreFactory = () => new MemoryTableViewStore();

class MemoryTableViewStore implements TableViewStore {
  private readonly views = new Map<string, TableView>();

  obtainView(tableName: TableName): TableView {
    return (
      this.views.get(tableName.toLowerCase()) ?? {
        tableName,
        grid: { offset: 0, sortings: [], conditions: [] },
        chosenRowKey: null,
        activeTabId: null,
        tabs: [],
      }
    );
  }

  saveView(view: TableView): void {
    this.views.set(view.tableName.toLowerCase(), view);
  }

  forgetView(tableName: TableName): void {
    this.views.delete(tableName.toLowerCase());
  }
}
