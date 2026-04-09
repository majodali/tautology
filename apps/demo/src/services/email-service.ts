/**
 * Email service — simulates sending emails.
 */

export function sendWelcomeEmail(email: string, name: string): { sent: boolean; to: string } {
  console.log(`  [email] Sending welcome email to ${name} <${email}>`);
  return { sent: true, to: email };
}

export function sendNotification(email: string, message: string): { sent: boolean; to: string } {
  console.log(`  [email] Sending notification to <${email}>: ${message}`);
  return { sent: true, to: email };
}
