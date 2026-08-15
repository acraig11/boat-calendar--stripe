import { defineStorage } from "@aws-amplify/backend";
import { approveOwnerRequestFunction } from "../functions/approve-owner-request/resource";

export const storage = defineStorage({
  name: "experienceImages",

  access: (allow) => ({
    "experience-images/{entity_id}/*": [
      allow.entity("identity").to(["read", "write", "delete"]),
      allow.authenticated.to(["read"]),
      allow.guest.to(["read"]),

      // Approval Lambda can write the approved image copy here.
      allow.resource(approveOwnerRequestFunction).to([
        "read",
        "write",
      ]),
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

      // Approval Lambda can read the submitted partner image.
      allow.resource(approveOwnerRequestFunction).to([
        "read",
      ]),
    ],
  }),
});