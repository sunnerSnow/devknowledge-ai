import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 只做「樂觀的」未登入導向 /login：看有沒有 session cookie，不查資料庫。
 * 真正的權限檢查在每個頁面、API 與 Server Action 裡（requireUser / getSessionUser）。
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // API 自己回 401（不轉址）
  const isPublic = pathname === "/login" || pathname.startsWith("/api/");
  if (!isPublic && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
