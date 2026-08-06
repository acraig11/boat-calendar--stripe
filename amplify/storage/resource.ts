import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "experienceImages",

  access: (allow) => ({
    "experience-images/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.authenticated.to(["read"]),
      allow.guest.to(["read"]),
    ],

    // Keep this temporarily so existing boat images still display.
    "boat-images/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.authenticated.to(["read"]),
      allow.guest.to(["read"]),
    ],
    "partner-request-images/{entity_id}/*": [
  allow.entity("identity").to(["read", "write", "delete"]),
  allow.authenticated.to(["read"]),
],
  }),
});
