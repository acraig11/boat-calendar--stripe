import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/approve-owner-request";
import { CopyObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);

Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();
const s3Client = new S3Client({});

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
  return values?.find(
    (value): value is string => Boolean(value?.trim()),
  )?.trim() ?? "";
}

function imageExtension(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;

  if (
    extension === "png" ||
    extension === "jpg" ||
    extension === "jpeg" ||
    extension === "webp" ||
    extension === "gif"
  ) {
    return extension;
  }

  return "jpg";
}

function encodeCopySource(bucketName: string, key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${bucketName}/${encodedKey}`;
}

async function copyPartnerImageToPublicExperienceImages(
  sourcePath: string,
  requestId: string,
  applicantUserId: string,
): Promise<string> {
  if (sourcePath.startsWith("experience-images/")) {
    return sourcePath;
  }

  if (!sourcePath.startsWith("partner-request-images/")) {
    throw new Error(
      `Unsupported owner-request image path: ${sourcePath}`,
    );
  }

 const bucketName = env.EXPERIENCE_IMAGES_BUCKET_NAME;

  if (!bucketName) {
    throw new Error(
      "The experienceImages Storage bucket is not available to the approval function.",
    );
  }

  const extension = imageExtension(sourcePath);

  const destinationPath =
    `experience-images/${applicantUserId}/${requestId}.${extension}`;

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: encodeCopySource(bucketName, sourcePath),
      Key: destinationPath,
    }),
  );

  return destinationPath;
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
          owner: applicantUserId,
        });

      if (createProfileResult.errors?.length || !createProfileResult.data) {
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
      const publicExperienceImageUrl =
        await copyPartnerImageToPublicExperienceImages(
          experienceImageUrl,
          requestId,
          applicantUserId,
        );

      const createExperienceResult =
        await client.models.Experience.create({
          id: requestId,
          name: experienceName,
          description: request.description?.trim() || undefined,
          location: experienceLocation,
          estimatedPrice: request.estimatedPrice ?? undefined,
          imageUrl: publicExperienceImageUrl,
          experienceType,
          ownerProfileId: ownerProfile.id,
          ownerAccessRequestId: requestId,
          owner: applicantUserId,
        });

      if (
        createExperienceResult.errors?.length ||
        !createExperienceResult.data
      ) {
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