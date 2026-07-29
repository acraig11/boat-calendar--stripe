import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { remove, uploadData } from "aws-amplify/storage";
import { client } from "../lib/amplifyClient";

type OwnerProfile = Awaited<
  ReturnType<typeof client.models.BoatOwnerProfile.list>
>["data"][number];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

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

export default function AddBoat() {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);

  const [name, setName] = useState("");
  const [experienceType, setExperienceType] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data, errors } = await client.models.BoatOwnerProfile.list();

        if (errors?.length) {
          throw new Error(errors.map((error) => error.message).join(", "));
        }

        setProfile(data[0] ?? null);
      } catch (error) {
        console.error(error);

        setMessage(
          error instanceof Error
            ? error.message
            : "The owner profile could not be loaded.",
        );
      }
    }

    void loadProfile();
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    setMessage("");
    setUploadProgress(0);

    if (!selectedFile) {
      clearSelectedImage();
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setMessage("Please select a JPEG, PNG, WebP, or GIF image.");

      event.target.value = "";
      clearSelectedImage();
      return;
    }

    if (selectedFile.size > MAX_IMAGE_SIZE) {
      setMessage("The image must be smaller than 10 MB.");

      event.target.value = "";
      clearSelectedImage();
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(selectedFile);
    setImagePreview(URL.createObjectURL(selectedFile));
  }

  function clearSelectedImage() {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview("");
    setUploadProgress(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function createSafeFileName(file: File) {
    const originalExtension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const safeExtension = originalExtension.replace(/[^a-z0-9]/g, "");
    const extension = safeExtension || getExtensionFromType(file.type);

    return `${crypto.randomUUID()}.${extension}`;
  }

  function getExtensionFromType(contentType: string) {
    switch (contentType) {
      case "image/png":
        return "png";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      default:
        return "jpg";
    }
  }

  async function uploadBoatImage(file: File) {
    const fileName = createSafeFileName(file);

    const result = await uploadData({
      path: ({ identityId }) => `boat-images/${identityId}/${fileName}`,
      data: file,
      options: {
        contentType: file.type,
        preventOverwrite: true,
        onProgress: ({ transferredBytes, totalBytes }) => {
          if (!totalBytes) {
            return;
          }

          const percentage = Math.round((transferredBytes / totalBytes) * 100);
          setUploadProgress(percentage);
        },
      },
    }).result;

    return result.path;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setUploadProgress(0);

    if (!profile) {
      setMessage("Create your owner profile first.");
      return;
    }

    if (!imageFile) {
      setMessage("Please select a boat image.");
      return;
    }

    const trimmedName = name.trim();
    const trimmedLocation = location.trim();
    const trimmedDescription = description.trim();
    const trimmedExperienceType = experienceType.trim();

    if (!trimmedName) {
      setMessage("Enter the boat name.");
      return;
    }

    if (!trimmedExperienceType) {
      setMessage("Select an experience type.");
      return;
    }

    if (!trimmedLocation) {
      setMessage("Enter the boat location.");
      return;
    }

    const numericPrice =
      estimatedPrice.trim() === "" ? undefined : Number(estimatedPrice);

    if (
      numericPrice !== undefined &&
      (!Number.isFinite(numericPrice) || numericPrice < 0)
    ) {
      setMessage("Enter a valid estimated price.");
      return;
    }

    let uploadedImagePath: string | null = null;

    try {
      setIsSubmitting(true);
      setMessage("Uploading boat image...");

      uploadedImagePath = await uploadBoatImage(imageFile);

      setMessage("Saving boat information...");

      const { data, errors } = await client.models.Boat.create({
        name: trimmedName,
        experienceType: trimmedExperienceType,
        location: trimmedLocation,
        description: trimmedDescription,
        estimatedPrice: numericPrice,
        imageUrl: uploadedImagePath,
        ownerProfileId: profile.id,
      });

      if (errors?.length) {
        throw new Error(errors.map((error) => error.message).join(", "));
      }

      if (!data) {
        throw new Error("The boat was not created.");
      }

      setName("");
      setExperienceType("");
      setLocation("");
      setDescription("");
      setEstimatedPrice("");
      clearSelectedImage();

      setMessage("Boat added successfully.");
    } catch (error) {
      console.error(error);

      if (uploadedImagePath) {
        try {
          await remove({
            path: uploadedImagePath,
          });
        } catch (cleanupError) {
          console.error(
            "The unused uploaded image could not be removed:",
            cleanupError,
          );
        }
      }

      setMessage(
        error instanceof Error ? error.message : "The boat could not be added.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Add Boat this is the new boat page</h1>

      {!profile && <p>You must create your owner profile first.</p>}

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="boat-name">Boat name</label>
          <input
            id="boat-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div>
          <label htmlFor="experience-type">Experience type</label>
          <select
            id="experience-type"
            value={experienceType}
            onChange={(event) => setExperienceType(event.target.value)}
            disabled={isSubmitting}
            required
          >
            <option value="">Choose an experience</option>
            {EXPERIENCE_TYPES.map((experience) => (
              <option key={experience} value={experience}>
                {experience}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="boat-location">Location</label>
          <input
            id="boat-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </div>

        <div>
          <label htmlFor="boat-description">Description</label>
          <textarea
            id="boat-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="boat-price">Estimated price</label>
          <input
            id="boat-price"
            type="number"
            min="0"
            step="0.01"
            value={estimatedPrice}
            onChange={(event) => setEstimatedPrice(event.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="boat-image">Choose a boat image</label>
          <input
            ref={fileInputRef}
            id="boat-image"
            name="boat-image"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={isSubmitting}
            required
          />

          {imageFile && (
            <p>
              Selected: <strong>{imageFile.name}</strong>
            </p>
          )}
        </div>

        {imagePreview && (
          <div>
            <p>Image preview</p>

            <img
              src={imagePreview}
              alt="Selected boat preview"
              style={{
                display: "block",
                width: "100%",
                maxWidth: "400px",
                height: "250px",
                objectFit: "cover",
                borderRadius: "12px",
              }}
            />

            {!isSubmitting && (
              <button type="button" onClick={clearSelectedImage}>
                Remove selected image
              </button>
            )}
          </div>
        )}

        {isSubmitting && uploadProgress > 0 && (
          <div>
            <label htmlFor="upload-progress">
              Upload progress: {uploadProgress}%
            </label>

            <progress id="upload-progress" value={uploadProgress} max="100">
              {uploadProgress}%
            </progress>
          </div>
        )}

        <button type="submit" disabled={!profile || isSubmitting}>
          {isSubmitting ? "Adding Boat..." : "Add Boat"}
        </button>
      </form>

      {message && <p>{message}</p>}
    </main>
  );
}
