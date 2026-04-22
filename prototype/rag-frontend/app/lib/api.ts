import type { ApiError } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

export { API_BASE };

export async function requestApi(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
  authToken?: string,
) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiError =
      typeof (data as ApiError)?.error === "string"
        ? (data as ApiError).error
        : "Request failed";
    throw new Error(`${response.status} ${apiError}`);
  }
  return data;
}
