import { pathToFileURL } from "node:url";
import { buildLocalDbConfig } from "./local-e2e-config";
import { buildGrantPaidPlanSql, runPsqlQuery } from "./local-e2e-db";

function runPsql(sql: string) {
  const config = buildLocalDbConfig();
  return runPsqlQuery(sql, config);
}

async function findUserIdByEmail(email: string) {
  // Safety: runPsqlQuery passes SQL as a discrete spawnSync argument (no shell
  // expansion), so there is no shell-injection risk. Quote-doubling is the
  // RFC-standard PostgreSQL literal escape and is sufficient for this local
  // dev script against a throwaway Docker container.
  const escapedEmail = email.replace(/'/g, "''");
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const userId = runPsql(
      `select "id" from "user" where "email" = '${escapedEmail}' limit 1;`,
    );

    if (userId) {
      return userId;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Could not find Better Auth user for ${email}.`);
}

export async function grantLocalPaidPlan(email: string) {
  const userId = await findUserIdByEmail(email);
  runPsql(buildGrantPaidPlanSql(userId));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let email: string | undefined;
  try {
    const emailFlagIndex = process.argv.indexOf("--email");
    email = emailFlagIndex >= 0 ? process.argv[emailFlagIndex + 1] : undefined;
    if (!email) {
      throw new Error("Missing --email argument.");
    }
  } catch {
    console.error(
      "Usage: tsx scripts/grant-local-paid-plan.ts --email <email>",
    );
    process.exit(1);
  }

  try {
    await grantLocalPaidPlan(email!);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
