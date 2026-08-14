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
  return values?.find((value): value is string => Boolean(value?.trim()))?.trim() ?? "";
}

export const handler: Schema["approveOwnerRequest"]["functionHandler"] =
  async (event) => {
    const identity = event.identity as CognitoIdentity | null | undefined;
    const signedInUserId = identity?.sub?.trim() ?? "";

    // Defense in depth: the mutation is authenticated, but only the fixed
    // moderator Cognito user may actually approve/provision an owner.
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

    if (!experienceType) {
      throw new Error("The request is missing an experience type.");
    }

    if (!experienceLocation) {
      throw new Error("The request is missing the experience location.");
    }

    if (!experienceImageUrl) {
      throw new Error("The request is missing the experience image.");
    }

    const experienceName =
      request.businessName?.trim() ||
      `${applicantName}'s ${experienceType} Experience`;

    // ------------------------------------------------------------
    // 1. Find or create the applicant's owner profile.
    //
    // Existing profiles are preserved. New profiles use the applicant's
    // Cognito sub as their record id, making retries deterministic.
    // ------------------------------------------------------------
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

    let ownerProfile = profileListResult.data[0] ?? null;

    if (!ownerProfile) {
      const createProfileResult =
        await client.models.ExperienceOwnerProfile.create({
          id: applicantUserId,
          userId: applicantUserId,
          name: applicantName,
          email: applicantEmail,
          phone: request.applicantPhone?.trim() || undefined,

          // allow.owner() automatically adds this field to the API.
          // Setting it explicitly assigns ownership to the applicant,
          // not the moderator/Lambda.
          owner: applicantUserId,
        });

      if (createProfileResult.errors?.length || !createProfileResult.data) {
        // A simultaneous retry may have created the deterministic profile id.
        const retryProfileResult =
          await client.models.ExperienceOwnerProfile.get({
            id: applicantUserId,
          });

        if (retryProfileResult.errors?.length || !retryProfileResult.data) {
          throw new Error(
            messages(createProfileResult.errors) ||
              messages(retryProfileResult.errors) ||
              "The applicant owner profile could not be created.",
          );
        }

        ownerProfile = retryProfileResult.data;
      } else {
        ownerProfile = createProfileResult.data;
      }
    }

    // ------------------------------------------------------------
    // 2. Create the initial Experience exactly once.
    //
    // The Experience id is the OwnerAccessRequest id. A second invocation
    // cannot create another row with the same id. ownerAccessRequestId is
    // also populated for traceability.
    // ------------------------------------------------------------
    const existingExperienceResult =
      await client.models.Experience.get({
        id: requestId,
      });

    if (existingExperienceResult.errors?.length) {
      throw new Error(
        messages(existingExperienceResult.errors) ||
          "The approved experience could not be checked.",
      );
    }

    if (!existingExperienceResult.data) {
      const createExperienceResult =
        await client.models.Experience.create({
          id: requestId,
          name: experienceName,
          description: request.description?.trim() || undefined,
          location: experienceLocation,
          estimatedPrice: request.estimatedPrice ?? undefined,
          imageUrl: experienceImageUrl,
          experienceType,
          ownerProfileId: ownerProfile.id,
          ownerAccessRequestId: requestId,

          // Same ownership rule: applicant owns the new Experience.
          owner: applicantUserId,
        });

      if (
        createExperienceResult.errors?.length ||
        !createExperienceResult.data
      ) {
        // Treat a concurrent duplicate create as success if the deterministic
        // record now exists.
        const retryExperienceResult =
          await client.models.Experience.get({
            id: requestId,
          });

        if (
          retryExperienceResult.errors?.length ||
          !retryExperienceResult.data
        ) {
          throw new Error(
            messages(createExperienceResult.errors) ||
              messages(retryExperienceResult.errors) ||
              "The applicant experience could not be created.",
          );
        }
      }
    }

    // ------------------------------------------------------------
    // 3. Mark the request approved only after profile + experience exist.
    // ------------------------------------------------------------
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

    return "APPROVED";
  };
