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
  boat: string,
  location: string,
  boatOwnerEmail: string,
) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing. Check your .env file.");
  }

  if (!(appointment instanceof Date) || Number.isNaN(appointment.getTime())) {
    throw new Error("The appointment date or time is invalid.");
  }

  if (!boatOwnerEmail.trim()) {
    throw new Error("The boat owner's email address was not found.");
  }

  const fullName =
    `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();

  const appointmentDate = formatDateForEmail(appointment);

  const appointmentTime = appointment.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const message = [
    "Boat Appointment Request",
    "",
    `Boat: ${boat || "Not set"}`,
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
      subject: "Boat Appointment Request",
      message,

      to_email: boatOwnerEmail,
      cc_email: "alan_craig@msn.com",

      boat_name: boat,
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

  console.log("EmailJS booking result:", result);

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
