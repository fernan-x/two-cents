export interface OwnershipCandidate {
  membershipId: string;
  role: 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}

const byTenure = (a: OwnershipCandidate, b: OwnershipCandidate) =>
  a.joinedAt.getTime() - b.joinedAt.getTime() || a.membershipId.localeCompare(b.membershipId);

/** New owner when an owner's account is deleted: oldest Admin, else oldest person (specs 001 R12, 002 edge case). */
export function pickNewOwner<T extends OwnershipCandidate>(members: readonly T[]): T | null {
  const admins = members.filter((m) => m.role === 'admin');
  const pool = admins.length > 0 ? admins : [...members];
  return [...pool].sort(byTenure)[0] ?? null;
}
