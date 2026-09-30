import { createClient } from "@sanity/client";
import dotenv from "dotenv";
dotenv.config();

const client = createClient({
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  apiVersion: "2024-08-01",
  useCdn: false,
  perspective: "published",
  token: process.env.SANITY_API_TOKEN,
});

async function exportUserEmails() {
  try {
    const query = `*[_type == "user" && defined(email)].email`;
    const emails: string[] = await client.fetch(query);
    const emailString = emails.filter(Boolean).join(", ");
    console.log("User emails:");
    console.log(emailString);
    console.log(`\nTotal: ${emails.length} email addresses`);
  } catch (error) {
    console.error("Error fetching emails:", error);
  }
}

exportUserEmails();
