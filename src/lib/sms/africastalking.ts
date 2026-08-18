/** Africa's Talking SMS client — logs in dev when credentials missing */

export async function sendSms(to: string, message: string): Promise<{ sent: boolean; messageId?: string }> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;
  const from = process.env.AT_SENDER_ID || "EDUTRACK";

  if (!apiKey || !username) {
    console.log(`[SMS dev] To: ${to} — ${message}`);
    return { sent: true, messageId: `dev-${Date.now()}` };
  }

  const normalized = to.startsWith("+") ? to : `+${to.replace(/^0/, "254")}`;

  const res = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username,
      to: normalized,
      message,
      from,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`SMS failed: ${JSON.stringify(data)}`);
  }

  const entry = data.SMSMessageData?.Recipients?.[0];
  return { sent: entry?.status === "Success", messageId: entry?.messageId };
}
