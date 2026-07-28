import { defineStorage } from "@aws-amplify/backend";

export const storage = defineStorage({
  name: "boatImages",

  access: (allow) => ({
    "boat-images/{entity_id}/*": [
      // The signed-in owner can upload, read, replace, and delete
      // images inside their own folder.
      allow.entity("identity").to(["read", "write", "delete"]),

      // Signed-in users can view all boat images.
      allow.authenticated.to(["read"]),

      // Visitors who are not signed in can also view boat images.
      allow.guest.to(["read"]),
    ],
  }),
});
