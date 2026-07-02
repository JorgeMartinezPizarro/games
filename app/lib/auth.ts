export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

const userCache = new Map<string, { user: AuthUser; expires: number }>();

type NextcloudUserPayload = {
  ocs?: {
    data?: {
      id?: string | number;
      displayname?: string;
      email?: string;
    };
  };
};

function parseNextcloudUser(payload: unknown): AuthUser {
  const data = (payload as NextcloudUserPayload)?.ocs?.data;
  const id = data?.id != null ? String(data.id).trim() : "";
  if (!id) throw new Error("Invalid user profile");

  return {
    id,
    name: data?.displayname?.trim() || data?.email?.trim() || id,
    email: data?.email?.trim() || id,
  };
}

export async function getCurrentUser(request: Request): Promise<AuthUser> {
  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "true") {
    return requireAuth(request);
  }
  return { id: "anonymous", name: "anonymous", email: "" };
}

export async function requireAuth(request: Request): Promise<AuthUser> {
  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "false") {
    return { id: "dev", name: "Dev User", email: "dev@local" };
  }

  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    throw new Error("No session cookie");
  }

  const cached = userCache.get(cookie);
  const now = Date.now();

  if (cached && cached.expires > now) {
    return cached.user;
  }

  const nextcloudUrl = process.env.NEXTCLOUD_URL;
  if (!nextcloudUrl) {
    throw new Error("Server misconfigured: missing NEXTCLOUD_URL");
  }

  let res: Response;
  try {
    res = await fetch(`${nextcloudUrl}/ocs/v2.php/cloud/user?format=json`, {
      headers: {
        cookie,
        Accept: "application/json",
        "OCS-APIRequest": "true",
      },
    });
  } catch {
    throw new Error("Nextcloud unreachable");
  }

  if (!res.ok) {
    throw new Error("Invalid Nextcloud session");
  }

  const payload = await res.json();
  const user = parseNextcloudUser(payload);

  userCache.set(cookie, { user, expires: now + 60_000 });

  return user;
}