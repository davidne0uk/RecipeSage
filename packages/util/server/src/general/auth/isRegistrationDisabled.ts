/**
 * Whether the operator has disabled new-account creation via the
 * DISABLE_REGISTRATION environment variable. This is the server-side control
 * and MUST gate every path that can create a user (password register and SSO),
 * independently of any client-supplied "allowRegistration" flag.
 */
export const isRegistrationDisabled = (): boolean =>
  process.env.DISABLE_REGISTRATION === "true";
