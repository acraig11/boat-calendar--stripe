import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { getCurrentUser } from "aws-amplify/auth";
import { remove, uploadData } from "aws-amplify/storage";
import { client } from "../lib/amplifyClient";
import { sendExperiencePartnerRequestSubmittedEmail } from "../utils/email";
import "./OfferExperiences.css";

const EXPERIENCE_TYPES = [
  "Home",
  "Boat",
  "Golf",
  "Fishing",
  "Tennis",
  "Swimming",
  "Skiing",
  "Hiking",
  "Biking",
  "Surfing",
  "Pickle Ball",
  "Beach",
];

const MODERATOR_EMAIL = "alan_craig@msn.com";
const MODERATOR_USER_ID =
  "14588428-20f1-706f-f6d7-308f21156444";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

type OwnerRequest = Awaited<
  ReturnType<typeof client.models.OwnerAccessRequest.list>
>["data"][number];

function OfferExperiencesContent() {
  const [existingRequest, setExistingRequest] =
    useState<OwnerRequest | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [experienceLocation, setExperienceLocation] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  const [description, setDescription] = useState("");
  const [selectedExperienceTypes, setSelectedExperienceTypes] =
    useState<string[]>([]);

  const [experienceImageFile, setExperienceImageFile] =
    useState<File | null>(null);
  const [experienceImagePreview, setExperienceImagePreview] =
    useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const experienceImageInputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function loadRequest() {
      try {
        const currentUser = await getCurrentUser();

        const result =
          await client.models.OwnerAccessRequest.list();

        if (result.errors?.length) {
          throw new Error(
            result.errors
              .map((error) => error.message)
              .join(", "),
          );
        }

        const request =
          result.data.find(
            (item) =>
              item.applicantUserId === currentUser.userId,
          ) ?? null;

        if (active) {
          setExistingRequest(request);
          setEmail(
            currentUser.signInDetails?.loginId ?? "",
          );
        }
      } catch (error: unknown) {
        console.error(
          "Could not load experience partner request:",
          error,
        );

        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "The experience partner request could not be loaded.",
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadRequest();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (experienceImagePreview) {
        URL.revokeObjectURL(experienceImagePreview);
      }
    };
  }, [experienceImagePreview]);

  function toggleExperienceType(experienceType: string) {
    setSelectedExperienceTypes((current) =>
      current.includes(experienceType)
        ? current.filter((item) => item !== experienceType)
        : [...current, experienceType],
    );
  }

  function clearExperienceImage() {
    if (experienceImagePreview) {
      URL.revokeObjectURL(experienceImagePreview);
    }

    setExperienceImageFile(null);
    setExperienceImagePreview("");
    setUploadProgress(0);

    if (experienceImageInputRef.current) {
      experienceImageInputRef.current.value = "";
    }
  }

  function handleExperienceImageChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile = event.target.files?.[0];

    setMessage("");
    setUploadProgress(0);

    if (!selectedFile) {
      clearExperienceImage();
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setMessage("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_IMAGE_SIZE) {
      setMessage(
        "The experience image must be smaller than 10 MB.",
      );
      event.target.value = "";
      return;
    }

    if (experienceImagePreview) {
      URL.revokeObjectURL(experienceImagePreview);
    }

    setExperienceImageFile(selectedFile);
    setExperienceImagePreview(
      URL.createObjectURL(selectedFile),
    );
  }

  function getImageExtension(file: File) {
    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    if (extension) {
      return extension;
    }

    if (file.type === "image/png") {
      return "png";
    }

    if (file.type === "image/webp") {
      return "webp";
    }

    return "jpg";
  }

  async function uploadExperienceImage(file: File) {
    const fileName =
      `${crypto.randomUUID()}.${getImageExtension(file)}`;

    const result = await uploadData({
      path: ({ identityId }) =>
        `partner-request-images/${identityId}/${fileName}`,
      data: file,
      options: {
        contentType: file.type,
        preventOverwrite: true,
        onProgress: ({
          transferredBytes,
          totalBytes,
        }) => {
          if (!totalBytes) {
            return;
          }

          setUploadProgress(
            Math.round(
              (transferredBytes / totalBytes) * 100,
            ),
          );
        },
      },
    }).result;

    return result.path;
  }

  async function submitRequest(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setMessage("Enter your name.");
      return;
    }

    if (!email.trim()) {
      setMessage("Enter your email address.");
      return;
    }

    if (!experienceLocation.trim()) {
      setMessage("Enter the location where you plan to offer the experience.");
      return;
    }

    const numericEstimatedPrice = Number(estimatedPrice);

    if (
      !estimatedPrice.trim() ||
      !Number.isFinite(numericEstimatedPrice) ||
      numericEstimatedPrice < 0
    ) {
      setMessage("Enter a valid estimated price.");
      return;
    }

    if (selectedExperienceTypes.length === 0) {
      setMessage(
        "Select at least one type of experience.",
      );
      return;
    }

    if (!experienceImageFile) {
      setMessage(
        "Choose an image representing the experience.",
      );
      return;
    }

    let uploadedImagePath: string | null = null;

    try {
      setIsSubmitting(true);
      setMessage("Uploading experience image...");
      setUploadProgress(0);

      const currentUser = await getCurrentUser();

      uploadedImagePath =
        await uploadExperienceImage(experienceImageFile);

      setMessage(
        "Submitting experience partner request...",
      );

      const requestResult =
        await client.models.OwnerAccessRequest.create({
          applicantUserId: currentUser.userId,
          applicantName: name.trim(),
          applicantEmail: email.trim(),
          applicantPhone: phone.trim() || undefined,
          businessName:
            businessName.trim() || undefined,
          experienceLocation: experienceLocation.trim(),
          estimatedPrice: numericEstimatedPrice,
          experienceTypes: selectedExperienceTypes,
          description: description.trim() || undefined,
          experienceImageUrl: uploadedImagePath,
          status: "PENDING",
          moderatorEmail: MODERATOR_EMAIL,
          moderatorUserId: MODERATOR_USER_ID,
        });

      if (requestResult.errors?.length) {
        throw new Error(
          requestResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      if (!requestResult.data) {
        throw new Error(
          "The experience partner request was not created.",
        );
      }

      const createdRequest = requestResult.data;

      const messageResult =
        await client.models.OwnerAccessMessage.create({
          ownerAccessRequestId: createdRequest.id,
          applicantUserId: currentUser.userId,
          moderatorEmail: MODERATOR_EMAIL,
          moderatorUserId: MODERATOR_USER_ID,
          senderUserId: currentUser.userId,
          senderRole: "SYSTEM",
          senderName: "Coast Life",
          message:
            "Your request to offer experiences with Coast Life was submitted for review.",
          messageType: "REQUEST_SUBMITTED",
          readByApplicantAt: new Date().toISOString(),
        });

      if (messageResult.errors?.length) {
        throw new Error(
          messageResult.errors
            .map((error) => error.message)
            .join(", "),
        );
      }

      let emailWarning = "";

      try {
        await sendExperiencePartnerRequestSubmittedEmail({
          applicantName: name.trim(),
          applicantEmail: email.trim(),
          applicantPhone: phone.trim() || undefined,
          businessName: businessName.trim() || undefined,
          experienceType: selectedExperienceTypes[0] ?? "Not set",
          experienceLocation: experienceLocation.trim(),
          estimatedPrice: numericEstimatedPrice,
          description: description.trim() || undefined,
        });
      } catch (emailError: unknown) {
        console.error(
          "The partner request was submitted, but the Coast Life email notification could not be sent:",
          emailError,
        );

        emailWarning =
          " Your request was saved, but the Coast Life email notification could not be sent.";
      }

      setExistingRequest(createdRequest);
      setMessage(
        "Your request to offer experiences was submitted successfully." +
          emailWarning,
      );
      clearExperienceImage();
    } catch (error: unknown) {
      console.error(
        "Could not submit experience partner request:",
        error,
      );

      if (uploadedImagePath) {
        try {
          await remove({
            path: uploadedImagePath,
          });
        } catch (cleanupError: unknown) {
          console.error(
            "Could not remove the unused partner image:",
            cleanupError,
          );
        }
      }

      setMessage(
        error instanceof Error
          ? error.message
          : "The experience partner request could not be submitted.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="offer-loading">
        Loading experience partner request...
      </main>
    );
  }

  if (existingRequest) {
    return (
      <main className="offer-experiences-page">
        <section className="offer-status-card">
          <p className="offer-experiences-eyebrow">
            Coast Life Experience Partner
          </p>

          <h1>Experience Partner Request</h1>

          <p>
            <strong>Status:</strong>{" "}
            <span className="offer-status-badge">
              {(existingRequest.status ?? "PENDING").toLowerCase()}
            </span>
          </p>

          <p>
            Your experience partner request has already been submitted.
            Coast Life will review your information and contact you through
            the request conversation.
          </p>

          {message && (
            <p className="offer-message">{message}</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="offer-experiences-page">
      <header className="offer-experiences-header">
        <p className="offer-experiences-eyebrow">
          Coast Life Experience Partner
        </p>

        <h1>Offer Experiences with Coast Life</h1>

        <p>
          Tell us about the experiences you would like to offer.
          Coast Life will review your request before enabling access
          to the Experience Owner Dashboard.
        </p>
      </header>

      {message && (
        <p className="offer-message">{message}</p>
      )}

      <section className="offer-experiences-card">
        <form
          className="offer-experiences-form"
          onSubmit={submitRequest}
        >
          <div className="offer-form-grid">
            <label className="offer-form-field">
              Name
              <input
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                required
              />
            </label>

            <label className="offer-form-field">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
                readOnly
              />
            </label>
          </div>

          <div className="offer-form-grid">
            <label className="offer-form-field">
              Phone
              <input
                type="tel"
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value)
                }
                placeholder="(555) 555-5555"
              />
            </label>

            <label className="offer-form-field">
              Business name
              <input
                value={businessName}
                onChange={(event) =>
                  setBusinessName(event.target.value)
                }
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="offer-form-grid">
            <label className="offer-form-field">
              Experience location
              <input
                value={experienceLocation}
                onChange={(event) =>
                  setExperienceLocation(event.target.value)
                }
                placeholder="City, state, marina, course, beach, or service area"
                required
              />
            </label>

            <label className="offer-form-field">
              Estimated price
              <input
                type="number"
                min="0"
                step="0.01"
                value={estimatedPrice}
                onChange={(event) =>
                  setEstimatedPrice(event.target.value)
                }
                placeholder="150.00"
                required
              />
            </label>
          </div>

          <section className="offer-image-picker">
            <div>
              <h2>Experience Image</h2>

              <p>
                Upload an image that helps Coast Life understand
                the experience you plan to offer.
              </p>
            </div>

            <input
              ref={experienceImageInputRef}
              id="experience-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleExperienceImageChange}
              disabled={isSubmitting}
              className="offer-image-input"
            />

            <label
              htmlFor="experience-image"
              className="offer-image-picker-button"
            >
              {experienceImageFile
                ? "Choose a Different Image"
                : "Choose Experience Image"}
            </label>

            {experienceImagePreview && (
              <div className="offer-image-preview-wrapper">
                <img
                  src={experienceImagePreview}
                  alt="Selected experience preview"
                  className="offer-image-preview"
                />

                <div className="offer-image-preview-details">
                  <strong>{experienceImageFile?.name}</strong>

                  {uploadProgress > 0 && (
                    <span>
                      Upload progress: {uploadProgress}%
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={clearExperienceImage}
                    disabled={isSubmitting}
                    className="offer-image-remove-button"
                  >
                    Remove Image
                  </button>
                </div>
              </div>
            )}
          </section>

          <fieldset className="experience-types-fieldset">
            <legend>Experiences you want to offer</legend>

            <div className="experience-types-grid">
              {EXPERIENCE_TYPES.map((experienceType) => (
                <label
                  className="experience-type-option"
                  key={experienceType}
                >
                  <input
                    type="checkbox"
                    checked={selectedExperienceTypes.includes(
                      experienceType,
                    )}
                    onChange={() =>
                      toggleExperienceType(experienceType)
                    }
                  />

                  <span>{experienceType}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="offer-form-field">
            Tell us about your experience
            <textarea
              rows={6}
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Describe your background, the experience you plan to offer, and what guests can expect."
            />
          </label>

          <button
            className="offer-submit-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? uploadProgress > 0 && uploadProgress < 100
                ? `Uploading ${uploadProgress}%...`
                : "Submitting..."
              : "Submit Experience Partner Request"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function OfferExperiences() {
  return (
    <Authenticator>
      {() => <OfferExperiencesContent />}
    </Authenticator>
  );
}