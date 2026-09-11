export const MAX_BODY_BYTES = 16_384;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STATUSES = ["new", "contacted", "closed"];
export const KINDS = ["applications", "project-requests"];

export class HttpError extends Error {
  constructor(status, message, fields, headers = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.headers = headers;
  }
}

export async function readJSON(request) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") || "")) {
    throw new HttpError(415, "Use application/json with UTF-8 encoding.");
  }
  if (request.headers.has("content-encoding") && request.headers.get("content-encoding") !== "identity") {
    throw new HttpError(415, "Compressed request bodies are not supported.");
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new HttpError(413, "Request body exceeds 16384 bytes.");
  }
  if (!request.body) throw new HttpError(400, "A JSON object is required.");
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "Request body exceeds 16384 bytes.");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  let parsed;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Malformed JSON or invalid UTF-8.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "A JSON object is required.");
  }
  return parsed;
}

const singleControls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const multiControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const surrogate = /[\ud800-\udfff]/u;

function textField(input, name, min, max, fields, { optional = false, multiline = false } = {}) {
  if (optional && input[name] === undefined) return undefined;
  if (typeof input[name] !== "string") {
    fields[name] = "Must be a string.";
    return undefined;
  }
  const value = input[name].trim();
  if (surrogate.test(input[name]) || (multiline ? multiControls : singleControls).test(input[name])) {
    fields[name] = "Contains unsupported control characters or invalid Unicode.";
    return undefined;
  }
  if (optional && value === "") return undefined;
  const length = [...value].length;
  if (length < min || length > max) fields[name] = `Use ${min}-${max} characters.`;
  return value;
}

function enumField(input, name, options, fields) {
  if (typeof input[name] !== "string" || !options.includes(input[name])) {
    fields[name] = `Choose one of: ${options.join(", ")}.`;
  }
  return input[name];
}

function validEmail(email) {
  if (!/^[\x21-\x7e]+$/.test(email)) return false;
  const pieces = email.split("@");
  if (pieces.length !== 2) return false;
  const [local, domain] = pieces;
  if (local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length > 1 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) && /^[a-z]{2,63}$/i.test(labels.at(-1));
}

export function validateSubmission(input, kind) {
  const allowed = kind === "applications"
    ? ["name", "email", "phone", "track", "format", "experience", "goals", "consent", "website"]
    : ["name", "email", "phone", "category", "summary", "details", "targetDate", "consent", "website"];
  const fields = Object.create(null);
  if (Object.keys(input).some(key => !allowed.includes(key))) fields._form = "Unknown fields are not accepted.";
  const data = {};
  data.name = textField(input, "name", 2, 100, fields);
  data.email = textField(input, "email", 3, 254, fields);
  if (data.email && !validEmail(data.email)) fields.email = "Enter a valid email address (ASCII characters only).";
  if (data.email) {
    const at = data.email.lastIndexOf("@");
    data.email = data.email.slice(0, at) + data.email.slice(at).toLowerCase();
  }
  const phone = textField(input, "phone", 7, 30, fields, { optional: true });
  if (phone && !/^[+0-9(). -]+$/.test(phone)) fields.phone = "Use digits and + ( ) . spaces or hyphens.";
  if (phone) data.phone = phone;
  if (kind === "applications") {
    data.track = textField(input, "track", 2, 80, fields);
    data.format = enumField(input, "format", ["online", "physical", "undecided"], fields);
    data.experience = textField(input, "experience", 2, 1000, fields, { multiline: true });
    data.goals = textField(input, "goals", 10, 2000, fields, { multiline: true });
  } else {
    data.category = enumField(input, "category", ["business-software", "mentorship", "code-review"], fields);
    data.summary = textField(input, "summary", 10, 160, fields);
    data.details = textField(input, "details", 20, 5000, fields, { multiline: true });
    const targetDate = textField(input, "targetDate", 10, 10, fields, { optional: true });
    if (targetDate) {
      const date = new Date(`${targetDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== targetDate || targetDate < "2026-01-01" || targetDate > "2100-12-31") {
        fields.targetDate = "Use a real YYYY-MM-DD date between 2026 and 2100.";
      }
      data.targetDate = targetDate;
    }
  }
  if (input.consent !== true) fields.consent = "Consent is required to store and review this enquiry.";
  data.consent = true;
  const website = textField(input, "website", 0, 200, fields, { optional: true });
  if (website) fields.website = "Leave this field empty.";
  if (Object.keys(fields).length) throw new HttpError(422, "Please check the highlighted fields.", fields);
  return data;
}

export function validateStatus(input) {
  const fields = Object.create(null);
  if (Object.keys(input).some(key => !["status", "version"].includes(key))) fields._form = "Unknown fields are not accepted.";
  enumField(input, "status", STATUSES, fields);
  if (!Number.isSafeInteger(input.version) || input.version < 1) fields.version = "A positive integer version is required.";
  if (Object.keys(fields).length) throw new HttpError(422, "Invalid review update.", fields);
  return input;
}
