import { env } from "../config/env.js";

const semaphoreApiUrl = "https://api.semaphore.co/api/v4/messages";

function normalizePhilippineNumber(phone: string) {
  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+63")) return digits.slice(1);
  if (digits.startsWith("63")) return digits;
  if (digits.startsWith("09")) return `63${digits.slice(1)}`;
  if (digits.startsWith("9")) return `63${digits}`;
  return digits;
}

export async function sendResidentProgressSms(phone: string, ticketNumber: string) {
  if (!env.SEMAPHORE_API_KEY) {
    return { sent: false, reason: "SEMAPHORE_API_KEY is not configured" } as const;
  }

  const form = new URLSearchParams({
    apikey: env.SEMAPHORE_API_KEY,
    number: normalizePhilippineNumber(phone),
    message: `San Pascual Connect: Your report ${ticketNumber} is now under progress. Our Barangay team is working on it.`,
    sendername: env.SEMAPHORE_SENDER_NAME,
  });
  const response = await fetch(semaphoreApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Semaphore returned HTTP ${response.status}`);
  }

  return { sent: true } as const;
}
