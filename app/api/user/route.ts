import { NextRequest, NextResponse } from "next/server";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

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

export async function GET(request: NextRequest) {

	console.log("get user", process.env.NEXT_PUBLIC_ENABLE_LOGIN);
  if (process.env.NEXT_PUBLIC_ENABLE_LOGIN === "false") {
    return NextResponse.json({ id: "dev", name: "Dev User", email: "dev@local" });
  }

  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    return NextResponse.json({ error: "No session cookie" }, { status: 401 });
  }

  const nextcloudUrl = process.env.NEXTCLOUD_URL;
  if (!nextcloudUrl) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
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
    return NextResponse.json({ error: "Nextcloud unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: "Invalid Nextcloud session" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return NextResponse.json({ error: "Invalid response from Nextcloud" }, { status: 502 });
  }

  try {
    const user = parseNextcloudUser(payload);
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Invalid user profile" }, { status: 401 });
  }
}