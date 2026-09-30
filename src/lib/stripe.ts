import Stripe from "stripe";

let instance: Stripe | undefined;
// Missing optional services must not prevent public pages from building.
export const stripe = new Proxy({} as Stripe, {
  get(_target, property) {
    const key = process.env.STRIPE_API_KEY;
    if (!key) throw new Error("Stripe is not configured for this project");
    instance ??= new Stripe(key, {
      apiVersion: "2024-04-10",
      typescript: true,
    });
    return Reflect.get(instance, property);
  },
});
