import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { getUrl, remove, uploadData } from "aws-amplify/storage";
import { getCurrentUser } from "aws-amplify/auth";
import { client } from "../lib/amplifyClient";

type OwnerProfile = Awaited<
  ReturnType<typeof client.models.BoatOwnerProfile.list>
>["data"][number];

type Boat = Awaited<ReturnType<typeof client.models.Boat.list>>["data"][number];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function BoatImage({
  imagePath,
  boatName,
}: {
  imagePath: string;
  boatName: string;
}) {
  const [displayUrl, setDisplayUrl] = useState("");

  useEffect(() => {
    let active = true;

    async function loadImage() {
      try {
        const result = await getUrl({
          path: imagePath,
        });

        if (active) {
          setDisplayUrl(result.url.toString());
        }
      } catch (error) {
        console.error("Could not load boat image:", error);
      }
    }

    void loadImage();

    return () => {
      active = false;
    };
  }, [imagePath]);

  if (!displayUrl) {
    return <p>Loading image...</p>;
  }

  return (
    <img
      src={displayUrl}
      alt={boatName}
      width="200"
      style={{
        height: "140px",
        objectFit: "cover",
        borderRadius: "10px",
      }}
    />
  );
}

function DashboardContent({
  signOut,
  userEmail,
}: {
  signOut?: () => void;
  userEmail: string;
}) {
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [boats, setBoats] = useState<Boat[]>([]);

  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const [boatName, setBoatName] = useState("");
  const [boatLocation, setBoatLocation] = useState("");
  const [boatDescription, setBoatDescription] = useState("");
  const [boatPrice, setBoatPrice] = useState("");

  const [boatImageFile, setBoatImageFile] = useState<File | null>(null);
  const [boatImagePreview, setBoatImagePreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddBoatForm, setShowAddBoatForm] = useState(false);
  const [deletingBoatId, setDeletingBoatId] = useState<string | null>(null);

  const boatImageInputRef = useRef<HTMLInputElement>(null);

  async function loadDashboard() {
    setIsLoading(true);
    setMessage("");

    try {
      const profileResult = await client.models.BoatOwnerProfile.list();

      if (profileResult.errors?.length) {
        throw new Error(
          profileResult.errors.map((error) => error.message).join(", "),
        );
      }

      const currentProfile = profileResult.data[0] ?? null;
      setProfile(currentProfile);

      if (currentProfile) {
        setProfileName(currentProfile.name);
        setProfilePhone(currentProfile.phone ?? "");
      }

      const boatResult = await client.models.Boat.list();

      if (boatResult.errors?.length) {
        throw new Error(
          boatResult.errors.map((error) => error.message).join(", "),
        );
      }

      setBoats(boatResult.data);
    } catch (error) {
      console.error("Could not load owner dashboard:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load the dashboard.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    return () => {
      if (boatImagePreview) {
        URL.revokeObjectURL(boatImagePreview);
      }
    };
  }, [boatImagePreview]);

  async function createProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = profileName.trim();
    const trimmedEmail = userEmail?.trim();

    if (!trimmedName) {
      setMessage("Enter the owner name.");
      return;
    }

    if (!trimmedEmail) {
      setMessage("The signed-in user's email could not be found.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");

      const currentUser = await getCurrentUser();

      const result = await client.models.BoatOwnerProfile.create({
        userId: currentUser.userId,
        name: trimmedName,
        email: trimmedEmail,
        phone: profilePhone.trim() || undefined,
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      if (!result.data) {
        throw new Error("The owner profile was not created.");
      }

      setProfile(result.data);
      setMessage("Owner profile created.");
    } catch (error) {
      console.error("Could not create profile:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not create the owner profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }
  function clearBoatImage() {
    if (boatImagePreview) {
      URL.revokeObjectURL(boatImagePreview);
    }

    setBoatImageFile(null);
    setBoatImagePreview("");
    setUploadProgress(0);

    if (boatImageInputRef.current) {
      boatImageInputRef.current.value = "";
    }
  }

  function handleBoatImageChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    setMessage("");
    setUploadProgress(0);

    if (!selectedFile) {
      clearBoatImage();
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
      setMessage("Please select a JPEG, PNG, WebP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (selectedFile.size > MAX_IMAGE_SIZE) {
      setMessage("The boat image must be smaller than 10 MB.");
      event.target.value = "";
      return;
    }

    if (boatImagePreview) {
      URL.revokeObjectURL(boatImagePreview);
    }

    setBoatImageFile(selectedFile);
    setBoatImagePreview(URL.createObjectURL(selectedFile));
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

    switch (file.type) {
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
    const fileName = `${crypto.randomUUID()}.${getImageExtension(file)}`;

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

          setUploadProgress(Math.round((transferredBytes / totalBytes) * 100));
        },
      },
    }).result;

    return result.path;
  }

  async function addBoat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) {
      setMessage("Create your owner profile first.");
      return;
    }

    if (!boatName.trim() || !boatLocation.trim()) {
      setMessage("Boat name and location are required.");
      return;
    }

    if (!boatImageFile) {
      setMessage("Please choose a boat image.");
      return;
    }

    const numericPrice =
      boatPrice.trim() === "" ? undefined : Number(boatPrice);

    if (
      numericPrice !== undefined &&
      (!Number.isFinite(numericPrice) || numericPrice < 0)
    ) {
      setMessage("Enter a valid estimated price.");
      return;
    }

    let uploadedImagePath: string | null = null;

    try {
      setIsSaving(true);
      setMessage("Uploading boat image...");
      setUploadProgress(0);

      uploadedImagePath = await uploadBoatImage(boatImageFile);

      setMessage("Saving boat information...");

      const result = await client.models.Boat.create({
        name: boatName.trim(),
        location: boatLocation.trim(),
        description: boatDescription.trim() || undefined,
        estimatedPrice: numericPrice,
        imageUrl: uploadedImagePath,
        ownerProfileId: profile.id,
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      if (!result.data) {
        throw new Error("The boat was not created.");
      }

      setBoats((currentBoats) => [...currentBoats, result.data]);

      setBoatName("");
      setBoatLocation("");
      setBoatDescription("");
      setBoatPrice("");
      clearBoatImage();
      setShowAddBoatForm(false);

      setMessage("Boat added successfully.");
    } catch (error) {
      console.error("Could not add boat:", error);

      if (uploadedImagePath) {
        try {
          await remove({
            path: uploadedImagePath,
          });
        } catch (cleanupError) {
          console.error("Could not remove unused image:", cleanupError);
        }
      }

      setMessage(
        error instanceof Error ? error.message : "Could not add the boat.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteBoat(boat: Boat) {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${boat.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingBoatId(boat.id);
      setMessage("");

      const result = await client.models.Boat.delete({
        id: boat.id,
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      setBoats((currentBoats) =>
        currentBoats.filter((currentBoat) => currentBoat.id !== boat.id),
      );

      if (boat.imageUrl) {
        try {
          await remove({
            path: boat.imageUrl,
          });
        } catch (imageError) {
          console.error(
            "Boat deleted, but its stored image could not be removed:",
            imageError,
          );
        }
      }

      setMessage(`"${boat.name}" was deleted.`);
    } catch (error) {
      console.error("Could not delete boat:", error);

      setMessage(
        error instanceof Error ? error.message : "Could not delete the boat.",
      );
    } finally {
      setDeletingBoatId(null);
    }
  }

  if (isLoading) {
    return <p>Loading owner dashboard...</p>;
  }

  return (
    <main className="owner-dashboard">
      <header className="owner-dashboard-header">
        <div>
          <h1>Boat Owner Dashboard</h1>
          <p>Signed in as {userEmail}</p>
        </div>

        <button type="button" onClick={signOut}>
          Sign Out
        </button>
      </header>

      {message && <p className="dashboard-message">{message}</p>}

      {!profile ? (
        <section className="dashboard-section">
          <h2>Create Owner Profile</h2>

          <form onSubmit={createProfile}>
            <div>
              <label htmlFor="profile-name">Owner name</label>

              <input
                id="profile-name"
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="profile-email">Email</label>

              <input
                id="profile-email"
                type="email"
                value={userEmail}
                readOnly
              />
            </div>

            <div>
              <label htmlFor="profile-phone">Phone</label>

              <input
                id="profile-phone"
                value={profilePhone}
                onChange={(event) => setProfilePhone(event.target.value)}
              />
            </div>

            <button type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Profile"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="dashboard-section">
            <h2>Owner Profile</h2>

            <p>
              <strong>Name:</strong> {profile.name}
            </p>

            <p>
              <strong>Email:</strong> {profile.email}
            </p>

            <p>
              <strong>Phone:</strong> {profile.phone || "Not provided"}
            </p>
          </section>

          <section className="dashboard-section">
            <h2>My Boats</h2>

            {boats.length === 0 ? (
              <p>You have not added any boats yet.</p>
            ) : (
              <div className="owner-boat-list">
                {boats.map((boat) => (
                  <article key={boat.id}>
                    {boat.imageUrl && (
                      <BoatImage
                        imagePath={boat.imageUrl}
                        boatName={boat.name}
                      />
                    )}

                    <h3>{boat.name}</h3>
                    <p>{boat.location}</p>

                    {boat.estimatedPrice != null && (
                      <p>Estimated price: ${boat.estimatedPrice.toFixed(2)}</p>
                    )}

                    {boat.description && <p>{boat.description}</p>}

                    <button
                      type="button"
                      onClick={() => {
                        void deleteBoat(boat);
                      }}
                      disabled={deletingBoatId === boat.id}
                      aria-label={`Delete ${boat.name}`}
                    >
                      {deletingBoatId === boat.id
                        ? "Deleting..."
                        : "Delete Boat"}
                    </button>
                  </article>
                ))}
              </div>
            )}

            {!showAddBoatForm && (
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setShowAddBoatForm(true);
                }}
              >
                Add Boat
              </button>
            )}
          </section>

          {showAddBoatForm && (
            <section className="dashboard-section">
              <h2>Add Boat</h2>

              <form onSubmit={addBoat}>
                <div>
                  <label htmlFor="boat-name">Boat name</label>
                  <input
                    id="boat-name"
                    value={boatName}
                    onChange={(event) => setBoatName(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="boat-location">Location</label>
                  <input
                    id="boat-location"
                    value={boatLocation}
                    onChange={(event) => setBoatLocation(event.target.value)}
                    disabled={isSaving}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="boat-description">Description</label>
                  <textarea
                    id="boat-description"
                    value={boatDescription}
                    onChange={(event) => setBoatDescription(event.target.value)}
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label htmlFor="boat-price">Estimated price</label>
                  <input
                    id="boat-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={boatPrice}
                    onChange={(event) => setBoatPrice(event.target.value)}
                    disabled={isSaving}
                  />
                </div>

                <div>
                  <label htmlFor="boat-image">Boat image</label>
                  <input
                    ref={boatImageInputRef}
                    id="boat-image"
                    type="file"
                    accept="image/*"
                    onChange={handleBoatImageChange}
                    disabled={isSaving}
                    required
                  />
                </div>

                {boatImagePreview && (
                  <img
                    src={boatImagePreview}
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
                )}

                {isSaving && uploadProgress > 0 && (
                  <progress value={uploadProgress} max="100">
                    {uploadProgress}%
                  </progress>
                )}

                <div>
                  <button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Boat"}
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      clearBoatImage();
                      setBoatName("");
                      setBoatLocation("");
                      setBoatDescription("");
                      setBoatPrice("");
                      setMessage("");
                      setShowAddBoatForm(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function OwnerDashboard() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <DashboardContent
          signOut={signOut}
          userEmail={user?.signInDetails?.loginId ?? "Signed-in owner"}
        />
      )}
    </Authenticator>
  );
}
