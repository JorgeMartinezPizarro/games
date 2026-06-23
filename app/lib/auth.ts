export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

const userCache = new Map<
  string,
  { user: AuthUser; expires: number }
>();

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
  if (!id) {
    throw new Error("Invalid user profile");
  }

  return {
    id,
    name: data?.displayname?.trim() || data?.email?.trim() || id,
    email: data?.email?.trim() || id,
  };
}

async function fetchNextcloudUser(request: Request): Promise<Response> {
  const cookie = request.headers.get("cookie") || "";

  return fetch(`${process.env.NEXTCLOUD_URL}/ocs/v2.php/cloud/user?format=json`, {
    headers: {
      cookie,
      Accept: "application/json",
      "OCS-APIRequest": "true",
    },
  });
}

export async function requireAuth(request: Request): Promise<AuthUser> {
  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    throw new Error("No session cookie");
  }

  const cached = userCache.get(cookie);
  const now = Date.now();

  if (cached && cached.expires > now) {
    return cached.user;
  }

  const res = await fetchNextcloudUser(request);

  if (!res.ok) {
    throw new Error("Invalid Nextcloud session");
  }

  const data = await res.json();
  const user = parseNextcloudUser(data);

  // cache corto por cookie (no token)
  userCache.set(cookie, {
    user,
    expires: now + 60_000,
  });

  return user;
}