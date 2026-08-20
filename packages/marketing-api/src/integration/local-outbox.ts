export type LocalEmailOutboxEntry = {
  channel: "email";
  template:
    | "confirmation"
    | "lead-magnet-delivery"
    | "survey-reminder"
    | "feedback-notification"
    | "nurture";
  to: string;
  from: string;
  subject: string;
  html: string;
};

export type LocalApolloOutboxEntry = {
  channel: "apollo";
  email: string;
  listName: string;
  payload: {
    email: string;
    label_names: string[];
    run_dedupe: true;
  };
};

export type LocalOutbox = {
  emails: LocalEmailOutboxEntry[];
  apollo: LocalApolloOutboxEntry[];
};

export function createLocalOutbox(): LocalOutbox {
  return {
    emails: [],
    apollo: [],
  };
}
