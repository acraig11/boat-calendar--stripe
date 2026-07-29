import { useEffect, useState } from "react";
import type { FormEvent, HTMLInputTypeAttribute } from "react";
import { getCurrentUser } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>();

type UserProfile = Schema["UserProfile"]["type"];

type ProfileForm = {
  firstName: string;
  lastName: string;
  ownerEmail: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  age: string;
  apparelSize: string;
  apparelGender: string;
};

const emptyForm: ProfileForm = {
  firstName: "",
  lastName: "",
  ownerEmail: "",
  phoneNumber: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  age: "",
  apparelSize: "",
  apparelGender: "",
};

function UserDashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [availablePoints, setAvailablePoints] = useState(0);

  const [form, setForm] = useState<ProfileForm>(emptyForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setIsLoading(true);
      setMessage("");

      const currentUser = await getCurrentUser();

      const signedInEmail =
        currentUser.signInDetails?.loginId?.trim().toLowerCase() ?? "";

      const result = await client.models.UserProfile.list({
        filter: {
          userId: {
            eq: currentUser.userId,
          },
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors.map((error) => error.message).join(", "));
      }

      const userRecords = result.data;

      const points = userRecords.reduce(
        (sum, record) => sum + Number(record.rewardPoints ?? 0),
        0,
      );

      setAvailablePoints(points);

      const hasProfileFields = (record: UserProfile) =>
        Boolean(
          record.firstName ||
          record.lastName ||
          record.ownerEmail ||
          record.phoneNumber ||
          record.address ||
          record.city ||
          record.state ||
          record.zip ||
          record.apparelSize ||
          record.apparelGender,
        );

      let profileRecords = userRecords.filter(hasProfileFields);

      // Older profile records may not have userId.
      // If no profile was found by userId, fall back to the signed-in email.
      if (profileRecords.length === 0 && signedInEmail) {
        const emailResult = await client.models.UserProfile.list({
          filter: {
            ownerEmail: {
              eq: signedInEmail,
            },
          },
        });

        if (emailResult.errors?.length) {
          throw new Error(
            emailResult.errors.map((error) => error.message).join(", "),
          );
        }

        profileRecords = emailResult.data.filter(hasProfileFields);
      }

      const userProfile =
        [...profileRecords].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0] ?? null;

      setProfile(userProfile);

      console.log("Signed-in user:", {
        userId: currentUser.userId,
        email: signedInEmail,
      });
      console.log("User point records:", userRecords);
      console.log("Available points:", points);
      console.log("Matching profile:", userProfile);

      if (userProfile) {
        setForm({
          firstName: userProfile.firstName ?? "",
          lastName: userProfile.lastName ?? "",
          ownerEmail: userProfile.ownerEmail ?? "",
          phoneNumber: userProfile.phoneNumber ?? "",
          address: userProfile.address ?? "",
          city: userProfile.city ?? "",
          state: userProfile.state ?? "",
          zip: userProfile.zip ?? "",
          age:
            userProfile.age === null || userProfile.age === undefined
              ? ""
              : String(userProfile.age),
          apparelSize: userProfile.apparelSize ?? "",
          apparelGender: userProfile.apparelGender ?? "",
        });

        setMessage("Profile and points loaded.");
      } else {
        setForm({
          ...emptyForm,
          ownerEmail: signedInEmail,
        });

        setIsEditing(true);
        setMessage("Complete your profile to continue.");
      }
    } catch (error) {
      console.error("Could not load user profile:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load the user profile.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateForm(field: keyof ProfileForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function beginEditing() {
    if (profile) {
      setForm({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        ownerEmail: profile.ownerEmail ?? "",
        phoneNumber: profile.phoneNumber ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        zip: profile.zip ?? "",
        age:
          profile.age === null || profile.age === undefined
            ? ""
            : String(profile.age),
        apparelSize: profile.apparelSize ?? "",
        apparelGender: profile.apparelGender ?? "",
      });
    }

    setMessage("");
    setIsEditing(true);
  }

  function cancelEditing() {
    if (!profile) {
      setMessage("A profile has not been created yet.");
      return;
    }

    setForm({
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      ownerEmail: profile.ownerEmail ?? "",
      phoneNumber: profile.phoneNumber ?? "",
      address: profile.address ?? "",
      city: profile.city ?? "",
      state: profile.state ?? "",
      zip: profile.zip ?? "",
      age:
        profile.age === null || profile.age === undefined
          ? ""
          : String(profile.age),
      apparelSize: profile.apparelSize ?? "",
      apparelGender: profile.apparelGender ?? "",
    });

    setMessage("");
    setIsEditing(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedFirstName = form.firstName.trim();
    const trimmedLastName = form.lastName.trim();
    const trimmedPhoneNumber = form.phoneNumber.trim();
    const trimmedState = form.state.trim().toUpperCase();
    const trimmedAge = form.age.trim();

    const age = trimmedAge === "" ? undefined : Number(trimmedAge);

    if (age !== undefined && (!Number.isInteger(age) || age < 1 || age > 120)) {
      setMessage("Enter a valid age between 1 and 120.");
      return;
    }

    if (!trimmedFirstName) {
      setMessage("Enter your first name.");
      return;
    }

    if (trimmedState && !/^[A-Z]{2}$/.test(trimmedState)) {
      setMessage("Enter the two-letter state abbreviation, such as FL.");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");

      const currentUser = await getCurrentUser();

      const signedInEmail = currentUser.signInDetails?.loginId
        ?.trim()
        .toLowerCase();

      const profileData = {
        firstName: trimmedFirstName,
        lastName: trimmedLastName || undefined,
        ownerEmail: signedInEmail || form.ownerEmail.trim() || undefined,
        phoneNumber: trimmedPhoneNumber || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: trimmedState || null,
        zip: form.zip.trim() || undefined,
        age,
        apparelSize: form.apparelSize.trim() || undefined,
        apparelGender: form.apparelGender.trim() || undefined,
      };

      if (profile?.id) {
        const result = await client.models.UserProfile.update({
          id: profile.id,
          userId: currentUser.userId,
          ...profileData,
        });

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!result.data) {
          throw new Error("The user profile was not updated.");
        }

        await loadProfile();
        setMessage("User profile updated.");
      } else {
        const result = await client.models.UserProfile.create({
          userId: currentUser.userId,
          rewardPoints: 0,
          ...profileData,
        });

        if (result.errors?.length) {
          throw new Error(
            result.errors.map((error) => error.message).join(", "),
          );
        }

        if (!result.data) {
          throw new Error("The user profile was not created.");
        }

        await loadProfile();
        setMessage("User profile created.");
      }

      setIsEditing(false);
    } catch (error) {
      console.error("Could not save user profile:", error);

      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save the user profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main style={styles.page}>
        <section style={styles.loadingCard}>
          <h2 style={{ marginTop: 0 }}>User Dashboard</h2>

          <p style={{ marginBottom: 0 }}>Loading user dashboard...</p>
        </section>
      </main>
    );
  }

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    "Create Your Profile";

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div style={styles.memberLabel}>Coast Life Member</div>

        <h1 style={styles.heroTitle}>{displayName}</h1>

        <div style={styles.rewardBox}>
          <div style={styles.rewardLabel}>Available Reward Points</div>

          <div style={styles.rewardPoints}>{availablePoints}</div>
        </div>
      </section>

      {!isEditing && (
        <button type="button" onClick={beginEditing} style={styles.editButton}>
          {profile ? "Edit Profile" : "Create Profile"}
        </button>
      )}

      {message && (
        <div
          style={{
            ...styles.message,
            color: message.toLowerCase().includes("could not")
              ? "#c62828"
              : "#666",
          }}
        >
          {message}
        </div>
      )}

      {isEditing && (
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>
            {profile ? "Edit Profile" : "Create Profile"}
          </h2>

          <p style={styles.formDescription}>
            Complete your information to manage rewards and account details.
          </p>

          <form onSubmit={saveProfile}>
            <div style={styles.formGrid}>
              <ProfileInput
                id="firstName"
                label="First Name"
                value={form.firstName}
                onChange={(value) => updateForm("firstName", value)}
                disabled={isSaving}
                required
              />

              <ProfileInput
                id="lastName"
                label="Last Name"
                value={form.lastName}
                onChange={(value) => updateForm("lastName", value)}
                disabled={isSaving}
              />
            </div>

            <ProfileInput
              id="ownerEmail"
              label="Email"
              type="email"
              value={form.ownerEmail}
              onChange={(value) => updateForm("ownerEmail", value)}
              disabled={isSaving}
              readOnly
            />

            <ProfileInput
              id="phoneNumber"
              label="Phone Number"
              type="tel"
              value={form.phoneNumber}
              onChange={(value) => updateForm("phoneNumber", value)}
              disabled={isSaving}
              placeholder="(555) 555-5555"
            />

            <ProfileInput
              id="address"
              label="Address"
              value={form.address}
              onChange={(value) => updateForm("address", value)}
              disabled={isSaving}
            />

            <div style={styles.formGrid}>
              <ProfileInput
                id="city"
                label="City"
                value={form.city}
                onChange={(value) => updateForm("city", value)}
                disabled={isSaving}
              />

              <ProfileInput
                id="state"
                label="State"
                value={form.state}
                onChange={(value) => updateForm("state", value.toUpperCase())}
                disabled={isSaving}
                maxLength={2}
                placeholder="FL"
              />
            </div>

            <div style={styles.formGrid}>
              <ProfileInput
                id="zip"
                label="ZIP Code"
                value={form.zip}
                onChange={(value) => updateForm("zip", value)}
                disabled={isSaving}
                inputMode="numeric"
                maxLength={10}
              />

              <ProfileInput
                id="age"
                label="Age"
                type="number"
                value={form.age}
                onChange={(value) => updateForm("age", value)}
                disabled={isSaving}
                min="1"
                max="120"
              />
            </div>

            <div style={styles.formGrid}>
              <ProfileSelect
                id="apparelSize"
                label="Apparel Size"
                value={form.apparelSize}
                onChange={(value) => updateForm("apparelSize", value)}
                disabled={isSaving}
                options={["XS", "S", "M", "L", "XL", "2XL", "3XL"]}
              />

              <ProfileSelect
                id="apparelGender"
                label="Apparel Style"
                value={form.apparelGender}
                onChange={(value) => updateForm("apparelGender", value)}
                disabled={isSaving}
                options={["Men's", "Women's", "Unisex"]}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                ...styles.saveButton,
                background: isSaving ? "#999" : "#34c759",
                cursor: isSaving ? "not-allowed" : "pointer",
              }}
            >
              {isSaving
                ? "Saving..."
                : profile
                  ? "Save Changes"
                  : "Create Profile"}
            </button>

            {profile && (
              <button
                type="button"
                onClick={cancelEditing}
                disabled={isSaving}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            )}
          </form>
        </section>
      )}

      {profile && !isEditing && (
        <>
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Contact Information</h2>

            <ProfileRow label="Email" value={profile.ownerEmail} />

            <ProfileRow label="Phone" value={profile.phoneNumber} />

            <ProfileRow label="Address" value={profile.address} />

            <ProfileRow label="City" value={profile.city} />

            <ProfileRow label="State" value={profile.state} />

            <ProfileRow label="ZIP" value={profile.zip} />
          </section>

          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Apparel Information</h2>

            <ProfileRow label="Age" value={profile.age} />

            <ProfileRow label="Size" value={profile.apparelSize} />

            <ProfileRow label="Style" value={profile.apparelGender} />
          </section>

          <section style={styles.card}>
            <ProfileRow
              label="Last Updated"
              value={
                profile.updatedAt
                  ? new Date(profile.updatedAt).toLocaleString()
                  : "Not set"
              }
              showBorder={false}
            />
          </section>
        </>
      )}
    </main>
  );
}

type ProfileInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: HTMLInputTypeAttribute;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  inputMode?:
    | "none"
    | "text"
    | "decimal"
    | "numeric"
    | "tel"
    | "search"
    | "email"
    | "url";
  min?: string;
  max?: string;
  maxLength?: number;
};

function ProfileInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
  required = false,
  readOnly = false,
  inputMode,
  min,
  max,
  maxLength,
}: ProfileInputProps) {
  return (
    <label htmlFor={id} style={styles.inputLabel}>
      {label}

      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        readOnly={readOnly}
        inputMode={inputMode}
        min={min}
        max={max}
        maxLength={maxLength}
        style={{
          ...styles.input,
          background: readOnly ? "#f2f2f7" : "#fff",
          color: readOnly ? "#666" : "#222",
        }}
      />
    </label>
  );
}

type ProfileSelectProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

function ProfileSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
}: ProfileSelectProps) {
  return (
    <label htmlFor={id} style={styles.inputLabel}>
      {label}

      <select
        id={id}
        name={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        style={styles.input}
      >
        <option value="">Select one</option>

        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProfileRow({
  label,
  value,
  showBorder = true,
}: {
  label: string;
  value: unknown;
  showBorder?: boolean;
}) {
  const displayedValue =
    value === null || value === undefined || value === ""
      ? "Not set"
      : String(value);

  return (
    <div
      style={{
        ...styles.profileRow,
        borderBottom: showBorder ? "1px solid #f0f0f0" : "none",
      }}
    >
      <span style={styles.rowLabel}>{label}</span>

      <span style={styles.rowValue}>{displayedValue}</span>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    maxWidth: 900,
    minHeight: "100vh",
    margin: "0 auto",
    padding: "20px 16px 40px",
    boxSizing: "border-box" as const,
    background: "#f2f2f7",
  },

  loadingCard: {
    padding: 24,
    background: "#fff",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.06)",
  },

  hero: {
    padding: 24,
    marginBottom: 16,
    color: "#fff",
    borderRadius: 22,
    background: "linear-gradient(135deg, #007aff, #00a8ff)",
    boxShadow: "0 12px 30px rgba(0,122,255,.25)",
  },

  memberLabel: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase" as const,
    opacity: 0.9,
  },

  heroTitle: {
    margin: "8px 0",
    fontSize: 34,
    lineHeight: 1.1,
  },

  rewardBox: {
    padding: 16,
    marginTop: 18,
    borderRadius: 16,
    background: "rgba(255,255,255,.18)",
    border: "1px solid rgba(255,255,255,.2)",
  },

  rewardLabel: {
    fontSize: 13,
    textTransform: "uppercase" as const,
    opacity: 0.85,
  },

  rewardPoints: {
    marginTop: 4,
    fontSize: 42,
    fontWeight: 800,
  },

  editButton: {
    width: "100%",
    padding: 14,
    marginBottom: 14,
    border: "none",
    borderRadius: 14,
    background: "#007aff",
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },

  message: {
    marginBottom: 14,
    fontSize: 14,
  },

  card: {
    padding: 18,
    marginBottom: 14,
    background: "#fff",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,.06)",
  },

  cardTitle: {
    marginTop: 0,
    marginBottom: 16,
  },

  formDescription: {
    marginTop: -6,
    marginBottom: 20,
    color: "#666",
    lineHeight: 1.5,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },

  inputLabel: {
    display: "block",
    marginBottom: 12,
    color: "#333",
    fontWeight: 700,
  },

  input: {
    width: "100%",
    padding: 12,
    marginTop: 6,
    border: "1px solid #ddd",
    borderRadius: 12,
    background: "#fff",
    color: "#222",
    fontSize: 16,
    boxSizing: "border-box" as const,
  },

  saveButton: {
    width: "100%",
    padding: 14,
    marginTop: 12,
    border: "none",
    borderRadius: 14,
    color: "#fff",
    fontSize: 16,
    fontWeight: 700,
  },

  cancelButton: {
    width: "100%",
    padding: 12,
    marginTop: 8,
    border: "none",
    background: "transparent",
    color: "#007aff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },

  profileRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    padding: "10px 0",
  },

  rowLabel: {
    color: "#666",
    fontWeight: 600,
  },

  rowValue: {
    fontWeight: 700,
    textAlign: "right" as const,
    overflowWrap: "anywhere" as const,
  },
};

export default UserDashboard;
