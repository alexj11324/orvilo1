/** The name shown for the signed-in account: full name, else email, else nothing. */
export const resolveAccountLabel = (user: { email?: string; fullName?: string }): string =>
  user.fullName?.trim() || user.email?.trim() || '';
