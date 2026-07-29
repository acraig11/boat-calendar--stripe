import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

export function formatDateForEmail(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function sendBookingEmailWithAppointment(
  appointment: Date,
  profile: {
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    ownerEmail?: string;
  },
  experience: string,
  location: string,
  experienceOwnerEmail: string,
) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing. Check your .env file.");
  }

  if (!(appointment instanceof Date) || Number.isNaN(appointment.getTime())) {
    throw new Error("The appointment date or time is invalid.");
  }

  if (!experienceOwnerEmail.trim()) {
    throw new Error("The experience owner's email address was not found.");
  }

  const fullName =
    `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();

  const appointmentDate = formatDateForEmail(appointment);

  const appointmentTime = appointment.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const message = [
    "Experience Appointment Request",
    "",
    `Experience: ${experience || "Not set"}`,
    `Location: ${location || "Not set"}`,
    "",
    `Name: ${fullName || "Not set"}`,
    `Phone: ${profile.phoneNumber ?? "Not set"}`,
    `Email: ${profile.ownerEmail ?? "Not set"}`,
    "",
    `Appointment Date: ${appointmentDate}`,
    `Appointment Time: ${appointmentTime}`,
  ].join("\n");

  const result = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      subject: "Experience Appointment Request",
      message,

      to_email: experienceOwnerEmail,
      cc_email: "alan_craig@msn.com",

      experience_name: experience,
      location,

      customer_name: fullName,
      customer_email: profile.ownerEmail ?? "",
      customer_phone: profile.phoneNumber ?? "",

      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );

  console.log("EmailJS experience booking result:", result);

  if (result.status !== 200) {
    throw new Error(
      `EmailJS failed. Status: ${result.status}, Text: ${result.text}`,
    );
  }

  return result;
}

const PRIZE_REDEMPTION_EMAIL =
  import.meta.env.VITE_PRIZE_REDEMPTION_EMAIL || "alan_craig@msn.com";

export async function sendPrizeRedemptionEmail(
  prize: {
    title: string;
    pointsNeeded: number;
  },
  profile: {
    firstName?: string;
    lastName?: string;
    ownerEmail?: string;
    phoneNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    age?: number | string;
    apparelSize?: string;
    apparelGender?: string;
  },
  currentPoints: number,
) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing.");
  }

  const remainingPoints = currentPoints - prize.pointsNeeded;

  const fullName =
    `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();

  const message = [
    "Prize Redemption Request",
    "",
    `Prize: ${prize.title}`,
    `Points Redeemed: ${prize.pointsNeeded}`,
    `Current Points: ${currentPoints}`,
    `Remaining Points: ${remainingPoints}`,
    "",
    `Name: ${fullName || "Not set"}`,
    `Email: ${profile.ownerEmail ?? "Not set"}`,
    `Phone: ${profile.phoneNumber ?? "Not set"}`,
    `Address: ${profile.address ?? "Not set"}`,
    `City: ${profile.city ?? "Not set"}`,
    `State: ${profile.state ?? "Not set"}`,
    `ZIP: ${profile.zip ?? "Not set"}`,
    `Age: ${profile.age ?? "Not set"}`,
    `Apparel Size: ${profile.apparelSize ?? "Not set"}`,
    `Apparel Gender: ${profile.apparelGender ?? "Not set"}`,
  ].join("\n");

  const result = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      subject: "Prize Redemption Request",
      message,

      to_email: PRIZE_REDEMPTION_EMAIL,
      cc_email: "alan_craig@msn.com",

      customer_name: fullName,
      customer_email: profile.ownerEmail ?? "",
      customer_phone: profile.phoneNumber ?? "",
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );

  if (result.status !== 200) {
    throw new Error(
      `EmailJS failed. Status: ${result.status}, Text: ${result.text}`,
    );
  }

  return result;
}

export async function sendPartnerRequestEmail({
  name,
  organization,
  email,
  phone,
  note,
}: {
  name: string;
  organization?: string;
  email: string;
  phone?: string;
  note: string;
}) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing. Check your .env file.");
  }

  const message = [
    "New Partner Request",
    "",
    `Name: ${name.trim()}`,
    `Organization: ${organization?.trim() || "Not set"}`,
    `Email: ${email.trim()}`,
    `Phone: ${phone?.trim() || "Not set"}`,
    "",
    "Note:",
    note.trim(),
  ].join("\n");

  const result = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      subject: "New Partner Request",
      message,

      to_email: "alan_craig@msn.com",
      cc_email: "alan_craig@msn.com",

      customer_name: name.trim(),
      customer_email: email.trim(),
      customer_phone: phone?.trim() ?? "",

      organization: organization?.trim() ?? "",
      note: note.trim(),
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );

  console.log("EmailJS partner result:", result);

  if (result.status !== 200) {
    throw new Error(
      `EmailJS failed. Status: ${result.status}, Text: ${result.text}`,
    );
  }

  return result;
}
