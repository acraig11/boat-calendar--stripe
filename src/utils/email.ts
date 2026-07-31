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

export type BookingDecisionStatus = "ACCEPTED" | "REJECTED";

export async function sendBookingDecisionEmail({
  customerName,
  customerEmail,
  experienceName,
  location,
  appointmentDateTime,
  status,
  ownerName,
  ownerEmail,
  ownerPhone,
}: {
  customerName: string;
  customerEmail: string;
  experienceName: string;
  location?: string | null;
  appointmentDateTime: string;
  status: BookingDecisionStatus;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
}) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing. Check your .env file.");
  }

  const recipientEmail = customerEmail.trim();

  if (!recipientEmail) {
    throw new Error("The customer's email address was not found.");
  }

  const appointment = new Date(appointmentDateTime);

  if (Number.isNaN(appointment.getTime())) {
    throw new Error("The booking date or time is invalid.");
  }

  const approved = status === "ACCEPTED";
  const appointmentDate = formatDateForEmail(appointment);

  const appointmentTime = appointment.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const subject = approved
    ? "Your Coast Life Booking Was Approved"
    : "Your Coast Life Booking Was Not Approved";

  const messageLines = [
    `Hello ${customerName.trim() || "Customer"},`,
    "",
    approved
      ? "Great news! Your booking request has been approved."
      : "Unfortunately, your booking request was not approved.",
    "",
    `Experience: ${experienceName || "Not set"}`,
    `Location: ${location || "Not set"}`,
    `Appointment Date: ${appointmentDate}`,
    `Appointment Time: ${appointmentTime}`,
  ];

  if (approved) {
    messageLines.push("", "Experience Owner Contact:");

    if (ownerName?.trim()) {
      messageLines.push(`Name: ${ownerName.trim()}`);
    }

    if (ownerEmail?.trim()) {
      messageLines.push(`Email: ${ownerEmail.trim()}`);
    }

    if (ownerPhone?.trim()) {
      messageLines.push(`Phone: ${ownerPhone.trim()}`);
    }

    messageLines.push("", "We look forward to seeing you.");
  } else {
    messageLines.push(
      "",
      "Please return to Coast Life to select another experience or appointment time.",
    );
  }

  const message = messageLines.join("\n");

  const result = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      subject,
      message,

      to_email: recipientEmail,
      cc_email: "alan_craig@msn.com",

      customer_name: customerName.trim(),
      customer_email: recipientEmail,

      experience_name: experienceName,
      location: location ?? "",

      appointment_date: appointmentDate,
      appointment_time: appointmentTime,

      booking_status: status,

      owner_name: ownerName?.trim() ?? "",
      owner_email: ownerEmail?.trim() ?? "",
      owner_phone: ownerPhone?.trim() ?? "",
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );

  console.log("EmailJS booking decision result:", result);

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

export async function sendContactEmail(message: string) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing. Check your .env file.");
  }

  return emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      subject: "Contact Form Submission",
      message,
      // Use the exact variable name configured in EmailJS.
      to_email: "alan_craig@msn.com",
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );
}
export async function sendBookingPendingEmail({
  customerName,
  customerEmail,
  experienceName,
  location,
  appointmentDateTime,
}: {
  customerName: string;
  customerEmail: string;
  experienceName: string;
  location?: string | null;
  appointmentDateTime: string;
}) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    throw new Error("EmailJS configuration is missing. Check your .env file.");
  }

  const recipientEmail = customerEmail.trim();

  if (!recipientEmail) {
    throw new Error("The customer's email address was not found.");
  }

  const appointment = new Date(appointmentDateTime);

  if (Number.isNaN(appointment.getTime())) {
    throw new Error("The booking date or time is invalid.");
  }

  const appointmentDate = formatDateForEmail(appointment);

  const appointmentTime = appointment.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const subject = "Your Coast Life Booking Request Was Received";

  const message = [
    `Hello ${customerName.trim() || "Customer"},`,
    "",
    "We received your booking request.",
    "",
    "Status: Pending Approval",
    "",
    `Experience: ${experienceName || "Not set"}`,
    `Location: ${location || "Not set"}`,
    `Requested Date: ${appointmentDate}`,
    `Requested Time: ${appointmentTime}`,
    "",
    "Your request has been sent to the experience owner for review.",
    "You will receive another email when your booking is approved or rejected.",
  ].join("\n");

  const result = await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    {
      subject,
      message,

      to_email: recipientEmail,
      cc_email: "alan_craig@msn.com",

      customer_name: customerName.trim(),
      customer_email: recipientEmail,

      experience_name: experienceName,
      location: location ?? "",

      appointment_date: appointmentDate,
      appointment_time: appointmentTime,

      booking_status: "PENDING",
    },
    {
      publicKey: EMAILJS_PUBLIC_KEY,
    },
  );

  console.log("EmailJS pending booking result:", result);

  if (result.status !== 200) {
    throw new Error(
      `EmailJS failed. Status: ${result.status}, Text: ${result.text}`,
    );
  }

  return result;
}