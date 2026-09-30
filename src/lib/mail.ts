import { ApprovalEmail } from "@/emails/approval-email";
import { NotifySubmissionEmail } from "@/emails/notify-submission-to-admin";
import { NotifySubmissionToUserEmail } from "@/emails/notify-submission-to-user";
import { PaymentSuccessEmail } from "@/emails/payment-success";
import RejectionEmail from "@/emails/rejection-email";
import { ResetPasswordEmail } from "@/emails/reset-password";
import VerifyEmail from "@/emails/verify-email";
import { Resend } from "resend";

let resendInstance: Resend | undefined;
export const resend = new Proxy({} as Resend, {
  get(_target, property) {
    const key = process.env.RESEND_API_KEY;
    if (!key)
      throw new Error("Email delivery is not configured for this project");
    resendInstance ??= new Resend(key);
    return Reflect.get(resendInstance, property);
  },
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL;

export const sendPasswordResetEmail = async (
  userName: string,
  email: string,
  token: string,
) => {
  const resetLink = `${SITE_URL}/auth/new-password?token=${token}`;

  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: email,
    subject: "Reset your password",
    react: ResetPasswordEmail({ userName, resetLink: resetLink }),
  });
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const confirmLink = `${SITE_URL}/auth/new-verification?token=${token}`;

  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: email,
    subject: "Confirm your email",
    react: VerifyEmail({ confirmLink }),
  });
};

export const sendNotifySubmissionEmail = async (
  userName: string,
  userEmail: string,
  itemName: string,
  statusLink: string,
  reviewLink: string,
) => {
  // console.log(`sendNotifySubmissionEmail,
  //   userName: ${userName},
  //   userEmail: ${userEmail},
  //   itemName: ${itemName},
  //   reviewLink: ${reviewLink},
  //   statusLink: ${statusLink}`);

  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: userEmail,
    subject: "Thank you for your submission",
    react: NotifySubmissionToUserEmail({
      userName,
      itemName,
      statusLink,
    }),
  });

  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: process.env.RESEND_EMAIL_ADMIN,
    subject: "New submission",
    react: NotifySubmissionEmail({ itemName, reviewLink }),
  });
};

export const sendPaymentSuccessEmail = async (
  userName: string,
  email: string,
  itemLink: string,
) => {
  // console.log(`sendPaymentSuccessEmail,
  //   email: ${email},
  //   userName: ${userName},
  //   itemLink: ${itemLink}`);

  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: email,
    subject: "Thank your for your submission",
    react: PaymentSuccessEmail({ userName, itemLink }),
  });
};

export const sendApprovalEmail = async (
  userName: string,
  email: string,
  itemLink: string,
) => {
  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: email,
    subject: "Your submission has been approved",
    react: ApprovalEmail({ userName, itemLink }),
  });
};

export const sendRejectionEmail = async (
  userName: string,
  email: string,
  dashboardLink: string,
) => {
  await resend.emails.send({
    from: process.env.RESEND_EMAIL_FROM,
    to: email,
    subject: "Please check your submission",
    react: RejectionEmail({ userName, dashboardLink }),
  });
};
