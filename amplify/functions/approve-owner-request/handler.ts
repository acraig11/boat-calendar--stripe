import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/approve-owner-request";

import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

const MODERATOR_USER_ID =
  "14588428-20f1-706f-f6d7-308f21156444";

type CognitoIdentity = {
  sub?: string;
  username?: string;
};

function messages(
  errors: readonly { message?: string | null }[] | undefined,
): string {
  return (
    errors
      ?.map((error) => error.message ?? "")
      .filter(Boolean)
      .join(", ") ?? ""
  );
}

function firstExperienceType(
  values: readonly (string | null)[] | null | undefined,
): string {
  return (
    values?.find(
      (value): value is string => Boolean(value?.trim()),
    )?.trim() ?? ""
  );
}

export const handler: Schema["approveOwnerRequest"]["functionHandler"] =
  async (event) => {
    const identity = event.identity as CognitoIdentity | null | undefined;
    const signedInUserId = identity?.sub?.trim() ?? "";

    if (signedInUserId !== MODERATOR_USER_ID) {
      throw new Error(
        "Only the Coast Life moderator can approve owner requests.",
      );
    }

    const requestId = event.arguments.requestId.trim();

    if (!requestId) {
      throw new Error("The owner request ID is missing.");
    }

    const requestResult =
      await client.models.OwnerAccessRequest.get({
        id: requestId,
      });

    if (requestResult.errors?.length) {
      throw new Error(
        messages(requestResult.errors) ||
          "The owner request could not be loaded.",
      );
    }

    const request = requestResult.data;

    if (!request) {
      throw new Error("The owner request could not be found.");
    }

    if (
      request.moderatorUserId &&
      request.moderatorUserId !== MODERATOR_USER_ID
    ) {
      throw new Error(
        "This owner request is assigned to a different moderator.",
      );
    }

    const applicantUserId = request.applicantUserId.trim();
    const applicantName = request.applicantName.trim();
    const applicantEmail = request.applicantEmail.trim();
    const experienceType = firstExperienceType(request.experienceTypes);
    const experienceLocation = request.experienceLocation.trim();
    const experienceImageUrl = request.experienceImageUrl?.trim() ?? "";

    if (!applicantUserId) {
      throw new Error("The request is missing the applicant user ID.");
    }

    if (!applicantName) {
      throw new Error("The request is missing the applicant name.");
    }

    if (!applicantEmail) {
      throw new Error("The request is missing the applicant email.");
    }

    // Keep validating the initial experience data now because the Stripe-ready
    // backend flow will create the experience later from this approved request.
    if (!experienceType) {
      throw new Error("The request is missing an experience type.");
    }

    if (!experienceLocation) {
      throw new Error("The request is missing the experience location.");
    }

    if (!experienceImageUrl) {
      throw new Error("The request is missing the experience image.");
    }

    // Approval creates the owner profile, but does NOT create the Experience.
    const profileListResult =
      await client.models.ExperienceOwnerProfile.list({
        filter: {
          userId: {
            eq: applicantUserId,
          },
        },
        limit: 100,
      });

    if (profileListResult.errors?.length) {
      throw new Error(
        messages(profileListResult.errors) ||
          "The applicant owner profile could not be checked.",
      );
    }

    const existingOwnerProfile = profileListResult.data[0] ?? null;

    if (!existingOwnerProfile) {
      const createProfileResult =
        await client.models.ExperienceOwnerProfile.create({
          id: applicantUserId,
          userId: applicantUserId,
          name: applicantName,
          email: applicantEmail,
          phone: request.applicantPhone?.trim() || undefined,
          owner: applicantUserId,
        });

      if (
        createProfileResult.errors?.length ||
        !createProfileResult.data
      ) {
        // A concurrent request may already have created this deterministic ID.
        const retryProfileResult =
          await client.models.ExperienceOwnerProfile.get({
            id: applicantUserId,
          });

        if (
          retryProfileResult.errors?.length ||
          !retryProfileResult.data
        ) {
          throw new Error(
            messages(createProfileResult.errors) ||
              messages(retryProfileResult.errors) ||
              "The applicant owner profile could not be created.",
          );
        }
      }
    }

    // Do not create Experience here.
    // The Stripe backend will publish it only when the connected account has:
    // details_submitted === true
    // charges_enabled === true
    // payouts_enabled === true
    const updateRequestResult =
      await client.models.OwnerAccessRequest.update({
        id: request.id,
        status: "APPROVED",
        reviewedByUserId: signedInUserId,
        reviewedAt: new Date().toISOString(),
      });

    if (
      updateRequestResult.errors?.length ||
      !updateRequestResult.data
    ) {
      throw new Error(
        messages(updateRequestResult.errors) ||
          "The owner request could not be marked approved.",
      );
    }

    console.log(
      "Owner request approved. Initial experience remains unpublished until Stripe onboarding is complete.",
      {
        requestId: request.id,
        applicantUserId,
      },
    );

    return "APPROVED";
  };