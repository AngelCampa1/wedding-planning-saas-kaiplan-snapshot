import type { MarketingDatabase } from "./marketing-client";

type MarketingRow = Record<string, unknown>;
type MarketingTable = "email_preference" | "email_unsubscribe_token" | string;
type ConditionFilter = {
  column: string;
  value: unknown;
  operator: "eq" | "in" | "lt";
};

const rowsByTable = new Map<MarketingTable, MarketingRow[]>();

function cloneRowsByTable() {
  return new Map(
    Array.from(rowsByTable.entries(), ([tableName, rows]) => [
      tableName,
      rows.map((row) => ({ ...row })),
    ]),
  );
}

function restoreRowsByTable(snapshot: Map<MarketingTable, MarketingRow[]>) {
  rowsByTable.clear();
  for (const [tableName, rows] of snapshot) {
    rowsByTable.set(
      tableName,
      rows.map((row) => ({ ...row })),
    );
  }
}

function getTableName(table: unknown): MarketingTable {
  if (!table || typeof table !== "object") {
    return "";
  }

  const nameSymbol = Object.getOwnPropertySymbols(table).find(
    (symbol) => symbol.description === "drizzle:Name",
  );
  const name = nameSymbol ? (table as Record<symbol, unknown>)[nameSymbol] : "";
  return typeof name === "string" ? name : "";
}

function extractConditionValues(condition: unknown) {
  const filters: ConditionFilter[] = [];
  const visited = new Set<unknown>();

  function recordIsNullFilters(value: Record<string | symbol, unknown>) {
    const chunks = value.queryChunks;
    if (!Array.isArray(chunks)) {
      return;
    }

    chunks.forEach((chunk, index) => {
      if (!chunk || typeof chunk !== "object" || !("name" in chunk)) {
        return;
      }

      const nextChunk = chunks[index + 1];
      if (!nextChunk || typeof nextChunk !== "object") {
        return;
      }

      const nextValues = (nextChunk as { value?: unknown }).value;
      const isNullChunk =
        Array.isArray(nextValues) &&
        nextValues.some(
          (part) => typeof part === "string" && part.includes("is null"),
        );

      if (isNullChunk && typeof chunk.name === "string") {
        filters.push({ column: chunk.name, value: null, operator: "eq" });
      }
    });
  }

  function recordSqlFilters(value: Record<string | symbol, unknown>) {
    const chunks = value.queryChunks;
    if (!Array.isArray(chunks)) {
      return;
    }

    chunks.forEach((chunk, index) => {
      if (!chunk || typeof chunk !== "object" || !("name" in chunk)) {
        return;
      }

      const column = chunk.name;
      if (typeof column !== "string") {
        return;
      }

      const operatorChunk = chunks[index + 1];
      if (!operatorChunk || typeof operatorChunk !== "object") {
        return;
      }

      const operatorValues = (operatorChunk as { value?: unknown }).value;
      const operatorText = Array.isArray(operatorValues)
        ? operatorValues.join("")
        : "";

      if (operatorText.includes(" < ")) {
        const param = chunks[index + 2] as
          | { constructor?: { name?: string }; value?: unknown }
          | undefined;
        if (param?.constructor?.name === "Param") {
          filters.push({ column, value: param.value, operator: "lt" });
        }
      }

      if (operatorText.includes(" = ")) {
        const param = chunks[index + 2] as
          | { constructor?: { name?: string }; value?: unknown }
          | undefined;
        if (param?.constructor?.name === "Param") {
          filters.push({ column, value: param.value, operator: "eq" });
        }
      }

      if (operatorText.includes(" in ")) {
        const params = chunks[index + 2];
        if (Array.isArray(params)) {
          filters.push({
            column,
            value: params
              .filter((param) => param?.constructor?.name === "Param")
              .map((param) => (param as { value?: unknown }).value),
            operator: "in",
          });
        }
      }
    });
  }

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || visited.has(value)) {
      return;
    }

    visited.add(value);
    const record = value as Record<string | symbol, unknown>;
    recordIsNullFilters(record);
    recordSqlFilters(record);

    if (Array.isArray(record.queryChunks)) {
      for (const child of record.queryChunks) {
        if (Array.isArray(child)) {
          child
            .filter((item) => item?.constructor?.name === "SQL")
            .forEach(visit);
        } else if (child?.constructor?.name === "SQL") {
          visit(child);
        }
      }
      return;
    }

    if (
      value.constructor?.name === "Param" &&
      record.encoder &&
      typeof record.encoder === "object"
    ) {
      const encoder = record.encoder as { name?: unknown };
      if (typeof encoder.name === "string") {
        filters.push({ column: encoder.name, value: record.value, operator: "eq" });
      }
    }

    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else {
        visit(child);
      }
    }
  }

  visit(condition);
  return filters;
}

function rowMatches(row: MarketingRow, filters: ConditionFilter[]) {
  return filters.every((filter) => {
    const rowValue = row[filter.column];
    if (filter.operator === "in") {
      return Array.isArray(filter.value) && filter.value.includes(rowValue);
    }
    if (filter.operator === "lt") {
      return String(rowValue) < String(filter.value);
    }
    return rowValue === filter.value;
  });
}

function normalizeRow(row: MarketingRow): MarketingRow {
  return {
    ...row,
    wedding_id: row.weddingId ?? row.wedding_id ?? null,
    preference_type: row.preferenceType ?? row.preference_type,
    updated_at: row.updatedAt ?? row.updated_at,
    created_at: row.createdAt ?? row.created_at,
    allowed_types: row.allowedTypes ?? row.allowed_types,
    expires_at: row.expiresAt ?? row.expires_at,
    used_at: row.usedAt ?? row.used_at ?? null,
    email_type: row.emailType ?? row.email_type,
    provider_message_id: row.providerMessageId ?? row.provider_message_id,
    error_message: row.errorMessage ?? row.error_message,
  };
}

function makeSelectBuilder() {
  let tableName: MarketingTable = "";
  let filters: ConditionFilter[] = [];

  const builder = {
    from(table: unknown) {
      tableName = getTableName(table);
      return builder;
    },
    where(condition: unknown) {
      filters = extractConditionValues(condition);
      return builder;
    },
    limit() {
      return builder;
    },
    then<TResult1 = MarketingRow[], TResult2 = never>(
      onFulfilled?:
        | ((value: MarketingRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onRejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) {
      const tableRows = rowsByTable.get(tableName) ?? [];
      const selected =
        filters.length > 0
          ? tableRows.filter((row) => rowMatches(row, filters))
          : tableRows;
      return Promise.resolve(selected).then(onFulfilled, onRejected);
    },
  };

  return builder;
}

function makeInsertBuilder(tableName: MarketingTable) {
  return {
    values(input: MarketingRow | MarketingRow[]) {
      const rows = Array.isArray(input) ? input : [input];
      const normalizedRows = rows.map(normalizeRow);
      const currentRows = rowsByTable.get(tableName) ?? [];
      rowsByTable.set(tableName, [...currentRows, ...normalizedRows]);

      return {
        returning: () => Promise.resolve(normalizedRows),
      };
    },
  };
}

function makeDeleteBuilder(tableName: MarketingTable) {
  return {
    where(condition: unknown) {
      const filters = extractConditionValues(condition);
      const currentRows = rowsByTable.get(tableName) ?? [];
      const remaining =
        filters.length > 0
          ? currentRows.filter((row) => !rowMatches(row, filters))
          : [];
      rowsByTable.set(tableName, remaining);

      return {
        returning: () => Promise.resolve([]),
      };
    },
  };
}

function makeUpdateBuilder(tableName: MarketingTable) {
  let updateValues: MarketingRow = {};

  return {
    set(input: MarketingRow) {
      updateValues = normalizeRow(input);
      return {
        where(condition: unknown) {
          const filters = extractConditionValues(condition);
          const currentRows = rowsByTable.get(tableName) ?? [];
          const updatedRows: MarketingRow[] = [];
          const nextRows = currentRows.map((row) => {
            if (!rowMatches(row, filters)) {
              return row;
            }

            const updated = { ...row, ...updateValues };
            updatedRows.push(updated);
            return updated;
          });
          rowsByTable.set(tableName, nextRows);

          return {
            returning: () => Promise.resolve(updatedRows),
          };
        },
      };
    },
  };
}

export function createLocalMarketingDb(): MarketingDatabase {
  return {
    select: () => makeSelectBuilder(),
    insert: (table: unknown) => makeInsertBuilder(getTableName(table)),
    delete: (table: unknown) => makeDeleteBuilder(getTableName(table)),
    update: (table: unknown) => makeUpdateBuilder(getTableName(table)),
    transaction: async <T>(
      callback: (tx: MarketingDatabase) => Promise<T> | T,
    ) => {
      const snapshot = cloneRowsByTable();
      try {
        return await callback(createLocalMarketingDb());
      } catch (error) {
        restoreRowsByTable(snapshot);
        throw error;
      }
    },
  } as unknown as MarketingDatabase;
}
