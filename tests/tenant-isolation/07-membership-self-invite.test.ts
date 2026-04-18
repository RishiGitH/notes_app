// Case 7: A user cannot invite themselves into a foreign org.
//
// The memberships INSERT policy only allows rows where the *inserting* user
// has role 'owner' or 'admin' in the target org. A user who has no
// membership in org2 at all cannot pass that check.
//
// Assertion: as userA (org1 member, no org2 membership), INSERT into
// memberships targeting org2 throws a "new row violates row-level security
// policy" error.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asUser } from "./helpers/as-user";
import { seedTwoOrgs, truncateAll, type TestFixture } from "./helpers/fixtures";
import { memberships } from "@/lib/db/schema";
import { v4 as uuidv4 } from "uuid";

let fx: TestFixture;

beforeAll(async () => {
  fx = await seedTwoOrgs();
});

afterAll(async () => {
  await truncateAll();
});

describe("membership self-invite into foreign org blocked", () => {
  it("userA cannot insert a membership row for themselves in org2", async () => {
    const { db, release } = await asUser(fx.userA.id);
    try {
      await expect(
        db.insert(memberships).values({
          id: uuidv4(),
          userId: fx.userA.id,
          orgId: fx.org2.id,
          role: "member",
        }),
      ).rejects.toThrow(/row-level security|violates/i);
    } finally {
      await release();
    }
  });
});
