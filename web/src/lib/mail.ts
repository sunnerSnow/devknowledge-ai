import { type MailEnv, mailEnv } from "@/lib/config";

export interface MailMessage {
  to: string;
  subject: string;
  /** 純文字內容；不寄 HTML，連結直接貼在內文 */
  text: string;
}

export interface Mailer {
  kind: Exclude<MailEnv["provider"], "none">;
  send(message: MailMessage): Promise<void>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/** 依設定建立寄信器；provider=none 回 null，呼叫端據此關閉忘記密碼與 Email 驗證 */
export function createMailer(env: MailEnv = mailEnv()): Mailer | null {
  if (env.provider === "none") return null;
  if (env.provider === "log") {
    return {
      kind: "log",
      async send(message) {
        // 開發用：整封信印在伺服器日誌（含 token 連結），所以正式環境預設不是這個模式
        console.log(`[dk mail] to=${message.to} subject=${message.subject}\n${message.text}\n`);
      },
    };
  }
  const apiKey = env.apiKey;
  if (!apiKey) throw new Error("MAIL_PROVIDER=resend 需要設定 RESEND_API_KEY");
  return {
    kind: "resend",
    async send(message) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      try {
        const res = await fetch(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: env.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          // 不把回應內文（可能含收件者）寫進錯誤；只留狀態碼
          throw new Error(`Resend 回應 ${res.status}`);
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** 重設密碼信 */
export function passwordResetMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: "重設 DevKnowledge AI 的密碼",
    text: [
      "你（或某個人）要求重設 DevKnowledge AI 帳號的密碼。",
      "",
      "請在 30 分鐘內開啟下面的連結設定新密碼：",
      link,
      "",
      "如果不是你提出的，忽略這封信即可，密碼不會改變。",
      "",
      "DevKnowledge AI",
    ].join("\n"),
  };
}

/** Email 驗證信 */
export function emailVerificationMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: "驗證你的 DevKnowledge AI Email",
    text: ["感謝你註冊 DevKnowledge AI。", "", "請在 24 小時內開啟下面的連結完成 Email 驗證：", link, "", "如果你沒有註冊，忽略這封信即可。", "", "DevKnowledge AI"].join("\n"),
  };
}
