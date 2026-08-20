import { z } from "zod";

/** US states, DC and the inhabited territories. */
export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["AS", "American Samoa"], ["GU", "Guam"], ["MP", "Northern Mariana Islands"],
  ["PR", "Puerto Rico"], ["VI", "U.S. Virgin Islands"],
] as const;

const STATE_CODES = US_STATES.map(([c]) => c) as unknown as [string, ...string[]];

const name = z
  .string()
  .trim()
  .min(1, "Required")
  .max(60, "Too long")
  .regex(/^[\p{L}][\p{L}\p{M}'’\-. ]*$/u, "Letters, hyphens and apostrophes only");

/**
 * Length beats character-class rules — NIST SP 800-63B dropped composition
 * requirements because they push people toward predictable substitutions.
 * 12 character minimum, block the obvious, otherwise let people breathe.
 */
export const password = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200, "Too long")
  .refine((p) => !/^(.)\1+$/.test(p), "Too repetitive")
  .refine(
    (p) =>
      ![
        "password1234", "123456789012", "qwertyuiop12", "letmein12345",
        "invext123456", "administrator",
      ].includes(p.toLowerCase()),
    "That password is too common",
  );

export const signupSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.email("Enter a valid email address").max(254).trim().toLowerCase(),
  password,
  state: z.enum(STATE_CODES, { message: "Select your state" }),
  terms: z.literal(true, { message: "You must accept the terms" }),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address").max(254).trim().toLowerCase(),
  password: z.string().min(1, "Enter your password").max(200),
});

export const verifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/** Flatten zod issues into { field: message } for the form UI. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
