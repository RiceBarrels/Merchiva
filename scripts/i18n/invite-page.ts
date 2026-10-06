// Merges the /invite/[token] page strings (`invite.*`) into all 8 locale files.
// Run: bun scripts/i18n/invite-page.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the subtrees in OWNED, and leaves a
// locale file untouched when nothing changed. zh-tw / zh-hk are converted from zh-cn leaf by leaf
// with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites both files wholesale and
// would erase other sessions' edits). `{org}` and `{email}` are replaced by the caller.
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["invite"];

const inv = (strings: Record<string, string>): Tree => ({ invite: strings });

const DICT: Record<HandLocale, Tree> = {
  en: inv({
    teamInvitation: "Team invitation",
    invitedTitle: "You're invited!",
    joinOrg: "Join {org} on Merchiva",
    joinTeam: "Join a team on Merchiva",
    yourRole: "Your role:",
    signedInAs: "Signed in as {email}",
    accept: "Accept invitation",
    joining: "Joining…",
    connecting: "Connecting…",
    signInTitle: "You're invited to join a team",
    signInDesc: "Sign in or create an account with the email address the invitation was sent to.",
    signIn: "Sign in to accept",
    createAccount: "Create an account",
    welcome: "Welcome aboard!",
    joined: "You've joined {org}. Taking you there…",
    joinedTeam: "You've joined the team. Taking you there…",
    errorTitle: "Can't accept this invitation",
    errInvalid: "This invitation link isn't valid. Ask the person who invited you to send a new one.",
    errUsed: "This invitation has already been used. If that wasn't you, ask for a new one.",
    errExpired: "This invitation has expired. Ask the person who invited you to send a new one.",
    errWrongEmail: "This invitation was sent to a different email address. Sign in with the address it was sent to.",
    errAlreadyMember: "You're already a member of this store.",
    errEmailTaken: "Your email address is linked to another Merchiva account. Sign in with that account to accept.",
    errNotConnected: "Still connecting. Wait a moment and try again.",
    errFailed: "Couldn't accept the invitation. Please try again.",
    useAnotherAccount: "Sign in with another account",
    goToDashboard: "Go to dashboard",
  }),
  "zh-cn": inv({
    teamInvitation: "团队邀请",
    invitedTitle: "你收到了邀请！",
    joinOrg: "加入 Merchiva 上的 {org}",
    joinTeam: "加入 Merchiva 上的团队",
    yourRole: "你的角色：",
    signedInAs: "当前登录：{email}",
    accept: "接受邀请",
    joining: "正在加入…",
    connecting: "正在连接…",
    signInTitle: "你被邀请加入一个团队",
    signInDesc: "请用收到邀请的邮箱登录或注册账号。",
    signIn: "登录并接受",
    createAccount: "创建账号",
    welcome: "欢迎加入！",
    joined: "你已加入 {org}，正在前往…",
    joinedTeam: "你已加入团队，正在前往…",
    errorTitle: "无法接受这个邀请",
    errInvalid: "这个邀请链接无效。请让邀请你的人重新发送一次。",
    errUsed: "这个邀请已经被使用过。如果不是你本人，请让对方重新邀请。",
    errExpired: "这个邀请已过期。请让邀请你的人重新发送一次。",
    errWrongEmail: "这个邀请是发给另一个邮箱的。请用收到邀请的那个邮箱登录。",
    errAlreadyMember: "你已经是这家店的成员了。",
    errEmailTaken: "你的邮箱已关联另一个 Merchiva 账号。请用那个账号登录后再接受。",
    errNotConnected: "还在连接中，请稍等片刻再试。",
    errFailed: "接受邀请失败，请重试。",
    useAnotherAccount: "用其他账号登录",
    goToDashboard: "前往首页",
  }),
  fr: inv({
    teamInvitation: "Invitation d'équipe",
    invitedTitle: "Vous êtes invité !",
    joinOrg: "Rejoindre {org} sur Merchiva",
    joinTeam: "Rejoindre une équipe sur Merchiva",
    yourRole: "Votre rôle :",
    signedInAs: "Connecté en tant que {email}",
    accept: "Accepter l'invitation",
    joining: "Adhésion…",
    connecting: "Connexion…",
    signInTitle: "Vous êtes invité à rejoindre une équipe",
    signInDesc: "Connectez-vous ou créez un compte avec l'adresse e-mail qui a reçu l'invitation.",
    signIn: "Se connecter pour accepter",
    createAccount: "Créer un compte",
    welcome: "Bienvenue !",
    joined: "Vous avez rejoint {org}. Redirection…",
    joinedTeam: "Vous avez rejoint l'équipe. Redirection…",
    errorTitle: "Impossible d'accepter cette invitation",
    errInvalid: "Ce lien d'invitation n'est pas valide. Demandez à la personne qui vous a invité d'en envoyer un nouveau.",
    errUsed: "Cette invitation a déjà été utilisée. Si ce n'était pas vous, demandez-en une nouvelle.",
    errExpired: "Cette invitation a expiré. Demandez à la personne qui vous a invité d'en envoyer une nouvelle.",
    errWrongEmail: "Cette invitation a été envoyée à une autre adresse e-mail. Connectez-vous avec l'adresse qui l'a reçue.",
    errAlreadyMember: "Vous êtes déjà membre de ce magasin.",
    errEmailTaken: "Votre adresse e-mail est liée à un autre compte Merchiva. Connectez-vous avec ce compte pour accepter.",
    errNotConnected: "Connexion en cours. Patientez un instant et réessayez.",
    errFailed: "Impossible d'accepter l'invitation. Réessayez.",
    useAnotherAccount: "Se connecter avec un autre compte",
    goToDashboard: "Aller au tableau de bord",
  }),
  es: inv({
    teamInvitation: "Invitación de equipo",
    invitedTitle: "¡Te han invitado!",
    joinOrg: "Únete a {org} en Merchiva",
    joinTeam: "Únete a un equipo en Merchiva",
    yourRole: "Tu rol:",
    signedInAs: "Sesión iniciada como {email}",
    accept: "Aceptar invitación",
    joining: "Uniéndote…",
    connecting: "Conectando…",
    signInTitle: "Te han invitado a unirte a un equipo",
    signInDesc: "Inicia sesión o crea una cuenta con el correo al que se envió la invitación.",
    signIn: "Iniciar sesión para aceptar",
    createAccount: "Crear una cuenta",
    welcome: "¡Bienvenido!",
    joined: "Te has unido a {org}. Llevándote allí…",
    joinedTeam: "Te has unido al equipo. Llevándote allí…",
    errorTitle: "No se puede aceptar esta invitación",
    errInvalid: "Este enlace de invitación no es válido. Pide a quien te invitó que envíe uno nuevo.",
    errUsed: "Esta invitación ya se usó. Si no fuiste tú, pide una nueva.",
    errExpired: "Esta invitación caducó. Pide a quien te invitó que envíe una nueva.",
    errWrongEmail: "Esta invitación se envió a otro correo. Inicia sesión con el correo que la recibió.",
    errAlreadyMember: "Ya eres miembro de esta tienda.",
    errEmailTaken: "Tu correo está vinculado a otra cuenta de Merchiva. Inicia sesión con esa cuenta para aceptar.",
    errNotConnected: "Aún conectando. Espera un momento e inténtalo de nuevo.",
    errFailed: "No se pudo aceptar la invitación. Inténtalo de nuevo.",
    useAnotherAccount: "Iniciar sesión con otra cuenta",
    goToDashboard: "Ir al panel",
  }),
  hi: inv({
    teamInvitation: "टीम आमंत्रण",
    invitedTitle: "आपको आमंत्रित किया गया है!",
    joinOrg: "Merchiva पर {org} से जुड़ें",
    joinTeam: "Merchiva पर एक टीम से जुड़ें",
    yourRole: "आपकी भूमिका:",
    signedInAs: "{email} के रूप में साइन इन",
    accept: "आमंत्रण स्वीकार करें",
    joining: "जुड़ रहे हैं…",
    connecting: "कनेक्ट हो रहा है…",
    signInTitle: "आपको एक टीम से जुड़ने का आमंत्रण मिला है",
    signInDesc: "जिस ईमेल पर आमंत्रण आया है, उसी से साइन इन करें या खाता बनाएँ।",
    signIn: "स्वीकार करने के लिए साइन इन करें",
    createAccount: "खाता बनाएँ",
    welcome: "स्वागत है!",
    joined: "आप {org} से जुड़ गए। आपको वहाँ ले जा रहे हैं…",
    joinedTeam: "आप टीम से जुड़ गए। आपको वहाँ ले जा रहे हैं…",
    errorTitle: "यह आमंत्रण स्वीकार नहीं हो सकता",
    errInvalid: "यह आमंत्रण लिंक मान्य नहीं है। जिसने आमंत्रित किया, उनसे नया भेजने को कहें।",
    errUsed: "यह आमंत्रण पहले ही इस्तेमाल हो चुका है। अगर वह आप नहीं थे, तो नया माँगें।",
    errExpired: "यह आमंत्रण समाप्त हो गया है। जिसने आमंत्रित किया, उनसे नया भेजने को कहें।",
    errWrongEmail: "यह आमंत्रण किसी दूसरे ईमेल पर भेजा गया था। उसी ईमेल से साइन इन करें जिस पर यह आया था।",
    errAlreadyMember: "आप पहले से इस स्टोर के सदस्य हैं।",
    errEmailTaken: "आपका ईमेल किसी दूसरे Merchiva खाते से जुड़ा है। स्वीकार करने के लिए उस खाते से साइन इन करें।",
    errNotConnected: "अभी कनेक्ट हो रहा है। थोड़ा रुककर फिर कोशिश करें।",
    errFailed: "आमंत्रण स्वीकार नहीं हो सका। फिर से कोशिश करें।",
    useAnotherAccount: "दूसरे खाते से साइन इन करें",
    goToDashboard: "डैशबोर्ड पर जाएँ",
  }),
  ar: inv({
    teamInvitation: "دعوة إلى فريق",
    invitedTitle: "لقد تمت دعوتك!",
    joinOrg: "انضم إلى {org} على Merchiva",
    joinTeam: "انضم إلى فريق على Merchiva",
    yourRole: "دورك:",
    signedInAs: "مسجّل الدخول باسم {email}",
    accept: "قبول الدعوة",
    joining: "جارٍ الانضمام…",
    connecting: "جارٍ الاتصال…",
    signInTitle: "تمت دعوتك للانضمام إلى فريق",
    signInDesc: "سجّل الدخول أو أنشئ حسابًا بالبريد الإلكتروني الذي وصلته الدعوة.",
    signIn: "سجّل الدخول للقبول",
    createAccount: "إنشاء حساب",
    welcome: "أهلًا بك!",
    joined: "انضممت إلى {org}. جارٍ نقلك…",
    joinedTeam: "انضممت إلى الفريق. جارٍ نقلك…",
    errorTitle: "تعذر قبول هذه الدعوة",
    errInvalid: "رابط الدعوة هذا غير صالح. اطلب ممن دعاك إرسال رابط جديد.",
    errUsed: "تم استخدام هذه الدعوة من قبل. إن لم تكن أنت، فاطلب دعوة جديدة.",
    errExpired: "انتهت صلاحية هذه الدعوة. اطلب ممن دعاك إرسال دعوة جديدة.",
    errWrongEmail: "أُرسلت هذه الدعوة إلى بريد إلكتروني آخر. سجّل الدخول بالبريد الذي وصلته.",
    errAlreadyMember: "أنت عضو في هذا المتجر بالفعل.",
    errEmailTaken: "بريدك الإلكتروني مرتبط بحساب Merchiva آخر. سجّل الدخول بذلك الحساب لقبول الدعوة.",
    errNotConnected: "ما زال الاتصال جاريًا. انتظر لحظة وحاول مرة أخرى.",
    errFailed: "تعذر قبول الدعوة. حاول مرة أخرى.",
    useAnotherAccount: "تسجيل الدخول بحساب آخر",
    goToDashboard: "الانتقال إلى لوحة التحكم",
  }),
};

const MESSAGES = join(import.meta.dir, "..", "..", "messages");

function flatten(tree: Tree, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push([path, v]);
    else out.push(...flatten(v, path));
  }
  return out;
}

function setLeaf(root: Record<string, unknown>, path: string, value: string): void {
  if (!OWNED.some((o) => path === o || path.startsWith(`${o}.`))) throw new Error(`${path} is outside ${OWNED.join(", ")}`);
  const parts = path.split(".");
  let cur = root;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (next === undefined) cur[part] = {};
    else if (typeof next !== "object" || next === null || Array.isArray(next)) throw new Error(`${path}: "${part}" is not an object`);
    cur = cur[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] !== undefined && typeof cur[leaf] !== "string") throw new Error(`${path} would overwrite an object`);
  cur[leaf] = value;
}

/** Returns true when the file changed. */
function mergeInto(locale: string, entries: Array<[string, string]>): boolean {
  const file = join(MESSAGES, `${locale}.json`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const mtime = statSync(file).mtimeMs;
    const original = readFileSync(file, "utf8");
    const json = JSON.parse(original) as Record<string, unknown>;
    for (const [k, v] of entries) setLeaf(json, k, v);
    const text = `${JSON.stringify(json, null, 2)}\n`;
    if (text === original) return false; // already merged: don't touch the file
    if (statSync(file).mtimeMs !== mtime) continue; // another writer: redo from a fresh read
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    return true;
  }
  throw new Error(`${locale}.json kept changing; rerun`);
}

const locales = Object.keys(DICT) as HandLocale[];
const enKeys = flatten(DICT.en).map(([k]) => k).sort().join("\n");
for (const loc of locales) {
  if (flatten(DICT[loc]).map(([k]) => k).sort().join("\n") !== enKeys) throw new Error(`${loc} key set differs from en`);
}
const changed: string[] = [];
for (const loc of locales) if (mergeInto(loc, flatten(DICT[loc]))) changed.push(loc);
const zh = flatten(DICT["zh-cn"]);
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const toHK = OpenCC.Converter({ from: "cn", to: "hk" });
if (mergeInto("zh-tw", zh.map(([k, v]): [string, string] => [k, applyTaiwanTerms(toTW(v), [[/郵箱/g, "信箱"]])]))) changed.push("zh-tw");
if (mergeInto("zh-hk", zh.map(([k, v]): [string, string] => [k, toHK(v)]))) changed.push("zh-hk");
console.log(`merged ${zh.length} keys into 8 locales; changed: ${changed.length > 0 ? changed.join(", ") : "none"}`);
