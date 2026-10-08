/**
 * A Mr. Merchiva action failure the user can act on. `key` names its message
 * under `merchiva.toast.*` (scripts/i18n/merchiva-refs.ts); the chat's failure
 * toast translates it. `message` stays English, for logs, and never carries an id.
 */
export class ActionError extends Error {
  constructor(
    readonly key: "targetMissing" | "evidenceNeedsChannel",
    message: string,
  ) {
    super(message);
    this.name = "ActionError";
  }
}
