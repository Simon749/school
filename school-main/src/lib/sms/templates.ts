// src/lib/sms/templates.ts

interface AttendanceAlertData {
  studentName: string;
  lessonName: string;
  time: string;
  reason: string;
  schoolPhone: string;
}

export function attendanceAlertTemplate(data: AttendanceAlertData): string {
  return `${data.studentName} was absent from ${data.lessonName} at ${data.time}. Reason: ${data.reason}. Contact school: ${data.schoolPhone}`;
}

interface FeeReminderData {
  studentName: string;
  balance: number;
  dueDate: string;
  paymentLink: string;
  mpesaTill: string;
}

export function feeReminderTemplate(data: FeeReminderData): string {
  return `${data.studentName} fee balance: KES ${data.balance.toLocaleString()} due ${data.dueDate}. Pay: ${data.paymentLink} or MPesa till ${data.mpesaTill}`;
}

interface ResultPublishedData {
  studentName: string;
  termName: string;
  viewLink: string;
}

export function resultPublishedTemplate(data: ResultPublishedData): string {
  return `${data.studentName}'s ${data.termName} results are ready. View: ${data.viewLink}`;
}

interface WelcomeData {
  schoolName: string;
  loginLink: string;
  tempPassword: string;
}

export function welcomeTemplate(data: WelcomeData): string {
  return `Welcome to ${data.schoolName}'s parent portal. Download the app: ${data.loginLink} or log in at ${data.loginLink}. Temp password: ${data.tempPassword}`;
}

interface PaymentConfirmationData {
  studentName: string;
  amount: number;
  mpesaCode: string;
  receiptNumber: string;
}

export function paymentConfirmationTemplate(data: PaymentConfirmationData): string {
  return `Payment of KES ${data.amount.toLocaleString()} received for ${data.studentName}. MPesa code: ${data.mpesaCode}. Receipt: ${data.receiptNumber}`;
}

interface MessageTemplateData {
  senderName: string;
  subject?: string;
  body: string;
  schoolName: string;
}

export function directMessageTemplate(data: MessageTemplateData): string {
  let message = `Message from ${data.senderName}`;
  if (data.subject) message += ` (${data.subject})`;
  message += `: ${data.body}`;
  message += `\n\n— ${data.schoolName}`;
  return message;
}

// Helper to truncate message to SMS length (160 chars per SMS)
export function truncateForSMS(message: string, maxLength: number = 160): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength - 3) + "...";
}