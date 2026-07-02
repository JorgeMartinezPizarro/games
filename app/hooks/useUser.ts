import { useState, useEffect } from "react";

type AuthUser = {
  id: string;
  name: string;
  email: string;
};

const ANONYMOUS: AuthUser = {
  id: "",
  name: "Anonymous",
  email: "",
};

export function useUser() {
  const [user, setUser] = useState<AuthUser>(ANONYMOUS);
  const [loading, setLoading] = useState(true);
  console.log(user);
  useEffect(() => {
    fetch("/bookmarks/api/user")
      .then((res) => (res.ok ? res.json() : ANONYMOUS))
      .then((data) => setUser(data))
      .catch(() => setUser(ANONYMOUS))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, isAuthenticated: user.id !== "" };
}