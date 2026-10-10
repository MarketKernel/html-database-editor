// @db-manager/connector — what the editor knows of any DBMS: a plugin, its storage, an open database's schema and rows.
// Implemented once per DBMS, by a package in plugins/; bound in host/src/serviceFactory.ts, which lists the plugins.
// Everything particular to a DBMS is its plugin's: what a plugin cannot do it refuses "not-supported", the editor shows why.
// ABSENCE IS null ON EVERY OUTPUT.
//
// Parts, and what each holds:
//   ConnectorPlugin      the descriptor, the storage, connect(): DatabaseStorage
//   DatabaseStorage      the databases the plugin keeps itself and the user's files it opens in place: list, create, import, export, open a file, rename, delete
//   DatabaseConnection   one open database: SchemaService, RowService
//   SchemaService        tables and views: read, create, alter, rename, drop
//   RowService           rows: a page, the rows matching a reference, create, update, delete
//
// Flows:
//   editor -> ConnectorPlugin#connect      the parameters of the descriptor's connection fields -> DatabaseConnection
//   editor -> SchemaService#preview…        a TableDraft -> SchemaChangePlan shown; alter… applies it afresh
//   editor -> RowService#selectMatchingRows the values of a foreign key's columns -> the target rows, for their titles

// Contracts
export type { ConnectorPlugin } from "./connectorPlugin.js";
export type { ConnectorPluginFactory } from "./connectorPlugin.js";

// Parts
export type { DatabaseStorage } from "./databaseStorage.js";
export type { DatabaseConnection } from "./databaseConnection.js";
export type { SchemaService } from "./schemaService.js";
export type { RowService } from "./rowService.js";

// Errors
export type { ConnectionError } from "./errors/connectionError.js";
export type { ConnectionErrorKind } from "./errors/connectionError.js";
export type { StorageError } from "./errors/storageError.js";
export type { StorageErrorKind } from "./errors/storageError.js";
export type { SchemaError } from "./errors/schemaError.js";
export type { SchemaErrorKind } from "./errors/schemaError.js";
export type { DefinitionViolation } from "./errors/definitionViolation.js";
export type { DefinitionViolationKind } from "./errors/definitionViolation.js";
export type { RowError } from "./errors/rowError.js";
export type { RowErrorKind } from "./errors/rowError.js";
export type { ConstraintKind } from "./errors/constraintKind.js";

// Models
export type { DatabaseEntry } from "./models/databaseEntry.js";

// Models: plugin
export type { PluginDescriptor } from "./models/plugin/pluginDescriptor.js";
export type { ConnectionField } from "./models/plugin/connectionField.js";
export type { DatabaseTemplate } from "./models/plugin/databaseTemplate.js";
export type { ColumnTypeSuggestion } from "./models/plugin/columnTypeSuggestion.js";
export type { TableOptionDescriptor } from "./models/plugin/tableOptionDescriptor.js";

// Models: schema
export type { TableSummary } from "./models/schema/tableSummary.js";
export type { TableDefinition } from "./models/schema/tableDefinition.js";
export type { ColumnDefinition } from "./models/schema/columnDefinition.js";
export type { GeneratedColumn } from "./models/schema/generatedColumn.js";
export type { UniqueConstraint } from "./models/schema/uniqueConstraint.js";
export type { ForeignKey } from "./models/schema/foreignKey.js";
export type { CheckConstraint } from "./models/schema/checkConstraint.js";
export type { IndexDefinition } from "./models/schema/indexDefinition.js";
export type { IndexPart } from "./models/schema/indexPart.js";
export type { RowIdentity } from "./models/schema/rowIdentity.js";
export type { TableDraft } from "./models/schema/tableDraft.js";
export type { ColumnDraft } from "./models/schema/columnDraft.js";
export type { ReferencingKey } from "./models/schema/referencingKey.js";
export type { SchemaChangePlan } from "./models/schema/schemaChangePlan.js";

// Models: row
export type { Row } from "./models/row/row.js";
export type { NewRow } from "./models/row/newRow.js";
export type { RowChange } from "./models/row/rowChange.js";
export type { ColumnCondition } from "./models/row/columnCondition.js";
export type { ColumnSorting } from "./models/row/columnSorting.js";
export type { RowPageRequest } from "./models/row/rowPageRequest.js";
export type { RowPage } from "./models/row/rowPage.js";

// Simple types
export type { ColumnName } from "./models/simpleTypes/columnName.js";
export type { DatabaseName } from "./models/simpleTypes/databaseName.js";
export type { DatabaseEntryKind } from "./models/simpleTypes/databaseEntryKind.js";
export type { SortOrder } from "./models/simpleTypes/sortOrder.js";
export type { ValueKind } from "./models/simpleTypes/valueKind.js";

// Simple types: plugin
export type { PluginId } from "./models/simpleTypes/plugin/pluginId.js";
export type { ConnectionFieldKind } from "./models/simpleTypes/plugin/connectionFieldKind.js";
export type { ConnectionParameters } from "./models/simpleTypes/plugin/connectionParameters.js";

// Simple types: schema
export type { TableName } from "./models/simpleTypes/schema/tableName.js";
export type { TableKind } from "./models/simpleTypes/schema/tableKind.js";
export type { ForeignKeyAction } from "./models/simpleTypes/schema/foreignKeyAction.js";
export type { GeneratedColumnStorage } from "./models/simpleTypes/schema/generatedColumnStorage.js";
export type { TableOptions } from "./models/simpleTypes/schema/tableOptions.js";

// Simple types: row
export type { CellValue } from "./models/simpleTypes/row/cellValue.js";
export type { RowKey } from "./models/simpleTypes/row/rowKey.js";
export type { ComparisonKind } from "./models/simpleTypes/row/comparisonKind.js";
