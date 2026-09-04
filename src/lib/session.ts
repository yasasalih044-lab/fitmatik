import { cookies } from "next/headers";
import { getAccount, readSession, SESSION_COOKIE, type Account } from "./accounts";

/** İstekteki oturum çerezinden hesabı çözer. Yoksa null. */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const id = readSession(jar.get(SESSION_COOKIE)?.value);
  return id ? getAccount(id) : null;
}
