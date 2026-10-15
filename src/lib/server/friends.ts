export function friendshipId(emailA: string, emailB: string): string {
  return [emailA.toLowerCase(), emailB.toLowerCase()].sort().join("__");
}

export function otherFriendEmail(emailA: string, emailB: string, selfEmail: string): string {
  return emailA.toLowerCase() === selfEmail.toLowerCase() ? emailB : emailA;
}
