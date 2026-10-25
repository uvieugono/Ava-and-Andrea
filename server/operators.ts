/**
 * People who check a club's bank transfer and switch its subscription on.
 * GYMTRACK_OPERATOR_EMAILS: comma-separated GymTrack sign-in emails.
 */
export function operatorEmails(env: NodeJS.ProcessEnv = process.env) {
  return (env.GYMTRACK_OPERATOR_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
