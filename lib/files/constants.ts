// File upload constants: MIME allowlist and size limits.
//
// AGENTS.md section 2 item 9: "File uploads validate MIME by sniffing bytes,
// not by trusting the client Content-Type."
//
// Only the types listed here are accepted. The sniffed MIME (via file-type)
// must appear in this set; otherwise the upload is rejected with 400.
//
// MAX_FILE_BYTES: 10 MiB. Enforced server-side before MIME sniff.
// BUCKET: Supabase Storage bucket name (must match 0009_storage_rls.sql when
//         that migration is applied by lead-backend).

export const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
]);

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB

export const STORAGE_BUCKET = "notes-files";
