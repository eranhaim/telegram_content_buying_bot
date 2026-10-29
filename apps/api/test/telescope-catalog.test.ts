import assert from "node:assert/strict";
import test from "node:test";
import { matchingTelescopeProfile, telescopeSlug } from "../src/telescope-catalog.js";

test("matches imported creators to Telescope profiles by id, handle, or display name", () => {
  const profiles = [
    { _id: "profile-1", handle: "@barburlovesyou", name: "Bar Siman Tov" },
    { _id: "profile-2", handle: "@jade-teenofficial", name: "Jade" },
  ];

  assert.equal(matchingTelescopeProfile(profiles, { telescopeProfileId: "profile-2", slug: "different", displayName: "Different" })?._id, "profile-2");
  assert.equal(matchingTelescopeProfile(profiles, { slug: "barburlovesyou", displayName: "Other" })?._id, "profile-1");
  assert.equal(matchingTelescopeProfile(profiles, { slug: "not-a-handle", displayName: "Bar Siman Tov" })?._id, "profile-1");
  assert.equal(telescopeSlug(" @Jade Teen Official "), "jade-teen-official");
});
