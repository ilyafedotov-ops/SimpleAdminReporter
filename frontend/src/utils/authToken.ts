export function isCookieAuthEnabled(): boolean {
  return import.meta.env.VITE_USE_COOKIE_AUTH === "true";
}

export function getAccessToken(): string | null {
  if (isCookieAuthEnabled()) {
    return null;
  }

  return localStorage.getItem("accessToken");
}

export function getAuthHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getAccessToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export function getSocketAuthOptions(): {
  auth?: { token: string };
  withCredentials: boolean;
} {
  const token = getAccessToken();

  return {
    auth: token ? { token } : undefined,
    withCredentials: isCookieAuthEnabled(),
  };
}
