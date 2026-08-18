// src/lib/sms/africastalking.ts
import Africa from "africastalking";

// Initialize the client
const credentials = {
  apiKey: process.env.AT_API_KEY || "",
  username: process.env.AT_USERNAME || "sandbox", // "sandbox" for testing
};

const africastalking = Africa(credentials);
export const sms = africastalking.SMS;

interface SendSMSOptions {
  to: string[];
  message: string;
  from?: string; // Shortcode or alphanumeric sender ID
}

interface SendSMSResult {
  recipients: Array<{
    statusCode: string;
    number: string;
    status: string;
    cost: string;
    messageId: string;
  }>;
}

export async function sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
  try {
    const result = await sms.send({
      to: options.to,
      message: options.message,
      from: options.from || process.env.AT_SENDER_ID,
    });

    return result;
  } catch (error: any) {
    console.error("Africa's Talking SMS error:", error);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
}

export async function fetchDeliveryReport(messageIds: string[]) {
  try {
    const result = await sms.fetchDeliveryReport({
      messageId: messageIds.join(","),
    });
    return result;
  } catch (error: any) {
    console.error("Delivery report fetch error:", error);
    throw new Error(`Failed to fetch delivery report: ${error.message}`);
  }
}