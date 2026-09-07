import { sendMail } from "./mailer";

const BRAND = "云小喵";

function wrap(title: string, body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <h2 style="margin:0 0 16px">${BRAND} · ${title}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
  <p style="color:#6b7280;font-size:12px;margin:0">此邮件由系统自动发送，请勿直接回复。</p>
</div>`;
}

export interface InstanceMailVars {
  username: string;
  email: string;
  instanceName: string;
  nodeName?: string;
  expireAt?: string;
  addresses?: string[];
}

export async function mailProvisioned(v: InstanceMailVars): Promise<void> {
  const lines = [
    `你好 ${v.username}，你的游戏服务器已开通成功：`,
    ``,
    `服务器：${v.instanceName}`,
    v.nodeName ? `节点：${v.nodeName}` : "",
    v.expireAt ? `到期时间：${v.expireAt}` : "",
    v.addresses && v.addresses.length ? `连接地址：\n${v.addresses.join("\n")}` : "",
    ``,
    `登录门户「我的服务」可一键进入管理面板、开关机与续费。`
  ]
    .filter(Boolean)
    .join("\n");
  await sendMail({
    to: v.email,
    subject: `【${BRAND}】服务器开通成功`,
    text: lines,
    html: wrap(
      "服务器开通成功",
      `<p>你好 <b>${v.username}</b>，你的游戏服务器已开通成功：</p>
       <ul>
         <li>服务器：<b>${v.instanceName}</b></li>
         ${v.nodeName ? `<li>节点：${v.nodeName}</li>` : ""}
         ${v.expireAt ? `<li>到期时间：${v.expireAt}</li>` : ""}
         ${v.addresses && v.addresses.length ? `<li>连接地址：<code>${v.addresses.join("<br/>")}</code></li>` : ""}
       </ul>
       <p>登录门户「我的服务」可一键进入管理面板、开关机与续费。</p>`
    )
  });
}

export async function mailRenewed(v: InstanceMailVars): Promise<void> {
  const lines = [
    `你好 ${v.username}，你的服务器续费成功：`,
    ``,
    `服务器：${v.instanceName}`,
    v.expireAt ? `新的到期时间：${v.expireAt}` : "",
    ``,
    `数据已保留，可继续使用。`
  ]
    .filter(Boolean)
    .join("\n");
  await sendMail({
    to: v.email,
    subject: `【${BRAND}】服务器续费成功`,
    text: lines,
    html: wrap(
      "服务器续费成功",
      `<p>你好 <b>${v.username}</b>，你的服务器续费成功：</p>
       <ul><li>服务器：<b>${v.instanceName}</b></li>
       ${v.expireAt ? `<li>新的到期时间：${v.expireAt}</li>` : ""}</ul>
       <p>数据已保留，可继续使用。</p>`
    )
  });
}

export async function mailExpiryReminder(v: InstanceMailVars, days: number): Promise<void> {
  const when = days <= 1 ? "1 天内" : `${days} 天内`;
  const lines = [
    `你好 ${v.username}，提醒你：以下服务器将于 ${when} 到期：`,
    ``,
    `服务器：${v.instanceName}`,
    v.expireAt ? `到期时间：${v.expireAt}` : "",
    ``,
    `到期后服务器将自动停机。请及时登录门户续费，续费后数据保留、无需重建。`
  ]
    .filter(Boolean)
    .join("\n");
  await sendMail({
    to: v.email,
    subject: `【${BRAND}】服务器即将到期提醒`,
    text: lines,
    html: wrap(
      "服务器即将到期",
      `<p>你好 <b>${v.username}</b>，提醒你：以下服务器将于 <b>${when}</b> 到期：</p>
       <ul><li>服务器：<b>${v.instanceName}</b></li>
       ${v.expireAt ? `<li>到期时间：${v.expireAt}</li>` : ""}</ul>
       <p>到期后服务器将自动停机。请及时登录门户续费，续费后数据保留、无需重建。</p>`
    )
  });
}

export async function mailPasswordReset(email: string, username: string, resetUrl: string): Promise<void> {
  const lines = [
    `你好 ${username}，我们收到了你的密码重置请求。`,
    ``,
    `请在 1 小时内点击下面的链接设置新密码：`,
    resetUrl,
    ``,
    `如果不是你本人操作，请忽略此邮件，你的密码不会改变。`
  ].join("\n");
  await sendMail({
    to: email,
    subject: `【${BRAND}】重置你的登录密码`,
    text: lines,
    html: wrap(
      "重置登录密码",
      `<p>你好 <b>${username}</b>，我们收到了你的密码重置请求。</p>
       <p>请在 <b>1 小时</b>内点击下面的按钮设置新密码：</p>
       <p><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">设置新密码</a></p>
       <p style="word-break:break-all;color:#6b7280;font-size:13px">或复制链接：${resetUrl}</p>
       <p>如果不是你本人操作，请忽略此邮件，你的密码不会改变。</p>`
    )
  });
}

export async function mailExpiredGrace(v: InstanceMailVars, graceDays: number): Promise<void> {
  const lines = [
    `你好 ${v.username}，你的游戏服务器已到期并停机：`,
    ``,
    `服务器：${v.instanceName}`,
    v.expireAt ? `到期时间：${v.expireAt}` : "",
    ``,
    `我们会为你保留 ${graceDays} 天宽限期。请在宽限期内登录门户续费，续费后数据保留、可直接恢复；`,
    `超过宽限期仍未续费，服务器将被清理，数据将无法恢复。`
  ]
    .filter(Boolean)
    .join("\n");
  await sendMail({
    to: v.email,
    subject: `【${BRAND}】服务器已到期，请尽快续费保留数据`,
    text: lines,
    html: wrap(
      "服务器已到期",
      `<p>你好 <b>${v.username}</b>，你的游戏服务器已到期并停机：</p>
       <ul><li>服务器：<b>${v.instanceName}</b></li>
       ${v.expireAt ? `<li>到期时间：${v.expireAt}</li>` : ""}</ul>
       <p>我们会为你保留 <b>${graceDays}</b> 天宽限期。请在宽限期内登录门户续费，续费后数据保留、可直接恢复；<b>超过宽限期仍未续费，服务器将被清理，数据将无法恢复。</b></p>`
    )
  });
}

export async function mailInstanceArchived(v: InstanceMailVars): Promise<void> {
  const lines = [
    `你好 ${v.username}，很遗憾地通知你：以下服务器已超过宽限期并被清理：`,
    ``,
    `服务器：${v.instanceName}`,
    v.expireAt ? `到期时间：${v.expireAt}` : "",
    ``,
    `服务器信息已归档。如需重新开服，可在门户使用新卡密一键开通。`
  ]
    .filter(Boolean)
    .join("\n");
  await sendMail({
    to: v.email,
    subject: `【${BRAND}】服务器已超过宽限期被清理`,
    text: lines,
    html: wrap(
      "服务器已清理",
      `<p>你好 <b>${v.username}</b>，很遗憾地通知你：以下服务器已超过宽限期并被清理：</p>
       <ul><li>服务器：<b>${v.instanceName}</b></li>
       ${v.expireAt ? `<li>到期时间：${v.expireAt}</li>` : ""}</ul>
       <p>服务器信息已归档。如需重新开服，可在门户使用新卡密一键开通。</p>`
    )
  });
}
