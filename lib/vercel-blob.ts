export function isVercelBlobConfigured() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  return Boolean(
    token &&
      !token.includes("your_") &&
      !token.includes("YOUR_") &&
      token.trim().length > 8
  );
}
