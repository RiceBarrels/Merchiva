import "server-only";

// The real PublicFormDeps: FORMS_PUBLIC_SECRET + SPACETIMEDB_SERVICE_TOKEN from
// the environment, SpacetimeDB over HTTP as the service identity. Without
// either value every request answers 503 `not_configured`.
//
// `/v1/database/<db>/call/<name>` takes only the snake_case reducer name and a
// positional JSON array in the reducer's declaration order (see
// lib/drive/server/stdb-calls.ts); the order below is the generated
// service_submit_public_form_response_reducer.ts.

import { callReducer } from "@/lib/spacetimedb/server-rpc";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { sqlRows } from "@/lib/drive/server/sql-rows";
import { parsePublicFormsConfig } from "./public";
import { createPublicFormHandlers, type PublicFormHandlers } from "./public-handlers";

let memo: PublicFormHandlers | null = null;

export function publicFormHandlers(): PublicFormHandlers {
  if (memo) return memo;
  const config = parsePublicFormsConfig(process.env);
  memo = createPublicFormHandlers({
    config: () => config,
    now: () => Date.now(),
    async sql(query, serviceToken) {
      return sqlRows(await spacetimeSql(query, { token: serviceToken }));
    },
    async ensureReader(serviceToken) {
      await callReducer({ token: serviceToken, name: "service_ensure_drive_reader", args: [] });
    },
    async submit(serviceToken, { token, responseId, answersJson, date }) {
      await callReducer({
        token: serviceToken,
        name: "service_submit_public_form_response",
        args: [token, responseId, answersJson, date],
      });
    },
    log(level, event, fields) {
      console[level](`[forms] ${event}`, fields ?? {});
    },
  });
  return memo;
}
