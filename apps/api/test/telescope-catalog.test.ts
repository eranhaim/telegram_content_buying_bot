import assert from "node:assert/strict";
import test from "node:test";
import { avatarProfilesCacheExpiry, matchingTelescopeProfile, signedAvatarExpiresAt, telescopeSlug } from "../src/telescope-catalog.js";

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

test("avatar cache expires before the source signature, including URLs already cached by Telescope", () => {
  const url = "https://example.s3.amazonaws.com/avatar.jpg?X-Amz-Date=20261103T120000Z&X-Amz-Expires=3600";
  const expires = Date.parse("2026-11-03T13:00:00Z");
  assert.equal(signedAvatarExpiresAt(url), expires);
  const profiles = [{ _id: "1", profileImageThumbUrl: url }];
  assert.equal(avatarProfilesCacheExpiry(profiles, Date.parse("2026-11-03T12:30:00Z")), Date.parse("2026-11-03T12:35:00Z"));
  assert.equal(avatarProfilesCacheExpiry(profiles, Date.parse("2026-11-03T12:57:00Z")), Date.parse("2026-11-03T12:59:00Z"));
  assert.equal(signedAvatarExpiresAt("not a URL"), undefined);
});
