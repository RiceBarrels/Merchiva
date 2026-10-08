// components/drive/model/virtual-sources.ts — "Stored in apps": the read-only links other apps keep.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { Identity, Timestamp, Uuid } from "spacetimedb";
import { previewParam } from "@/components/drive/model/url-state";
import { VIRTUAL_SOURCE_IDS } from "@/components/drive/model/types";
import { isRecordEntry, type VirtualEntry } from "@/components/drive/model/types";
import { VIRTUAL_SOURCES, appFileSizeOf, buildVirtualEntries, parseEvidenceJson, type VirtualFormInput, type VirtualInput } from "@/components/drive/model/virtual-sources";
import { formEditHref } from "@/components/forms/list/status";
import { appFileKeyHash } from "@/lib/storage/uploadthing-key";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
// Generated rows carry the SDK's Uuid / Identity / Timestamp objects, not strings and Dates. A Uuid's
// toHexString has no dashes, while the uuid string columns hold its hyphenated toString().
const U = (s: string) => Uuid.parse(s);
const I = (hex: string) => Identity.fromString(hex);
const T = (ms: number) => Timestamp.fromDate(new Date(ms));
const MICROS = (ms: number) => new Timestamp(BigInt(ms) * BigInt(1000));

const ANA = { id: uuid(), userIdHex: "aa".repeat(32), name: "Ana" };
const BEN = { id: uuid(), userIdHex: "bb".repeat(32), name: "Ben" };

function input(patch: Partial<VirtualInput> = {}): VirtualInput {
  return {
    organizationId: ORG, actorMemberId: ANA.id, canViewAll: false, storeIdentity: false, identityHex: ANA.userIdHex,
    members: [ANA, BEN], chatConversations: [], chatMessages: [], roleTasks: [], taskAssignments: [],
    inventoryTransactions: [], inventoryItems: [], trainingObjectives: [], bugReports: [], organizations: [], users: [],
    labels: { untitledAttachment: "Attachment", storeLogo: "Store logo", profilePhoto: "Your profile photo", photoN: "{name} · photo {n}" },
    locale: "en",
    ...patch,
  };
}

describe("VIRTUAL_SOURCES", () => {
  test("one per source id, with copy keys that exist and gates as specified", () => {
    expect(VIRTUAL_SOURCES.map((s) => s.id)).toEqual([...VIRTUAL_SOURCE_IDS]);
    // The forms source's copy waits in a draft until the i18n step merges it into messages/*.json.
    const trees = ["scripts/i18n/drive/drive-ui/en.json", "scripts/i18n/forms-drafts/drive-source.en.json", "messages/en.json"]
      .filter((path) => existsSync(path))
      .map((path) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
    const lookup = (key: string) => trees
      .map((tree) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree))
      .find((value) => typeof value === "string");
    for (const s of VIRTUAL_SOURCES) {
      expect(typeof lookup(s.labelKey)).toBe("string");
      if (s.countKey) for (const key of [s.countKey, `${s.countKey}One`]) expect(typeof lookup(key)).toBe("string");
    }
    const by = Object.fromEntries(VIRTUAL_SOURCES.map((s) => [s.id, s.requires]));
    expect(by.chat).toEqual({ permission: "staffing", hideOnStore: true });
    expect(by.inventory).toEqual({ permission: "inventory" });
    expect(by.products).toEqual({ permission: "products", appRoute: "/manager/products" });
    expect(by.tasks).toEqual({ appRoute: "/manager/personnel/roles" });
    expect(by.training).toEqual({ appRoute: "/manager/personnel/training" });
    expect(by.bugs).toEqual({});
    expect(by.forms).toEqual({ appRoute: "/manager/forms" });
  });
});

describe("parseEvidenceJson", () => {
  test("tolerates bad JSON, keeps distinct http(s) links, defaults the type to image", () => {
    expect(parseEvidenceJson(null)).toEqual([]);
    expect(parseEvidenceJson("")).toEqual([]);
    expect(parseEvidenceJson("{nope")).toEqual([]);
    expect(parseEvidenceJson('{"url":"https://x.test/a"}')).toEqual([]);
    expect(parseEvidenceJson(JSON.stringify([
      { url: "https://x.test/a.jpg", type: "image/jpeg" },
      "https://x.test/b",
      { url: "https://x.test/a.jpg", type: "image/png" },
      { url: "javascript:alert(1)" },
      { url: "data:image/png;base64,AAAA" },
      { type: "image" },
      null,
      42,
      { url: " http://x.test/c.mp4 ", type: "video" },
    ]))).toEqual([
      { url: "https://x.test/a.jpg", type: "image/jpeg" },
      { url: "https://x.test/b", type: "image" },
      { url: "http://x.test/c.mp4", type: "video" },
    ]);
  });
});

describe("chat", () => {
  const conv = { id: U(uuid()), organizationId: ORG, type: "group", name: "Kitchen" };
  const dm = { id: U(uuid()), organizationId: ORG, type: "dm", name: undefined };
  const foreign = { id: U(uuid()), organizationId: OTHER_ORG, type: "group", name: "Elsewhere" };
  const msg = (conversation: { id: Uuid }, patch: Record<string, unknown>) =>
    ({ id: U(uuid()), conversationId: String(conversation.id), senderId: I(BEN.userIdHex), createdAt: T(5_000), ...patch });

  test("only this store's conversations; names, kinds, owners and groups", () => {
    const rows = [
      msg(conv, { attachmentUrl: "https://utfs.io/f/abc", attachmentType: "image", attachmentName: "Menu photo" }),
      msg(conv, { attachmentUrl: "https://utfs.io/f/report%20q3.pdf", attachmentType: "file", createdAt: T(9_000) }),
      msg(foreign, { attachmentUrl: "https://utfs.io/f/secret.png", attachmentType: "image" }),
      msg(conv, { content: "no attachment" }),
      msg(conv, { attachmentUrl: "ftp://x.test/a.png", attachmentType: "image" }),
    ];
    const entries = buildVirtualEntries("chat", input({ chatConversations: [conv, foreign], chatMessages: rows }));
    expect(entries.map((e) => e.name)).toEqual(["report q3.pdf", "Menu photo"]);
    const [pdf, photo] = entries;
    expect([pdf.fileKind, pdf.mimeType, pdf.updatedAt]).toEqual(["pdf", "application/pdf", 9_000]);
    expect([photo.fileKind, photo.mimeType]).toEqual(["image", "application/octet-stream"]);
    expect([photo.ownerMemberId, photo.ownerName, photo.isMine, photo.group, photo.originRoute]).toEqual([BEN.id, "Ben", false, "Kitchen", "/manager/channel"]);
    expect(photo.key).toBe(`v:chat:${String(rows[0].id)}`);
    expect(photo.access.canOpen && photo.access.canDownload && !photo.access.canRename && !photo.access.canTrash).toBe(true);
    for (const e of entries) {
      expect(e.key).toBe(`v:chat:${e.id}`);
      expect(previewParam(e.key)).toBe(e.key);
      expect(e.location).toBeNull();
    }
  });

  test("sizes: an UploadThing file by its key hash; another link, or one not recorded, has none", () => {
    const rows = [
      msg(conv, { attachmentUrl: "https://utfs.io/f/abc", attachmentType: "image", attachmentName: "Menu photo", createdAt: T(3_000) }),
      msg(conv, { attachmentUrl: "https://app1.ufs.sh/f/unrecorded", attachmentType: "image", createdAt: T(2_000) }),
      msg(conv, { attachmentUrl: "https://x.test/f/abc", attachmentType: "image", createdAt: T(1_000) }),
    ];
    const appFileSizes = new Map([[appFileKeyHash("abc") ?? "", { sizeBytes: 2048, source: "chat" as const, mimeType: "image/png" }]]);
    const sized = buildVirtualEntries("chat", input({ chatConversations: [conv], chatMessages: rows, appFileSizes }));
    expect(sized.map((e) => e.sizeBytes)).toEqual([2048, null, null]);
    expect(appFileSizeOf("https://utfs.io/f/abc", appFileSizes)).toBe(2048);
    expect(appFileSizeOf("abc", appFileSizes)).toBeNull();
    // Without the lookups (an older module) every size is unknown.
    expect(buildVirtualEntries("chat", input({ chatConversations: [conv], chatMessages: rows })).map((e) => e.sizeBytes)).toEqual([null, null, null]);
  });

  test("a conversation without a name is named after the other people in it", () => {
    const rows = [
      msg(dm, { attachmentUrl: "https://x.test/a.png", attachmentType: "image", senderId: I(ANA.userIdHex) }),
      msg(dm, { content: "hi", senderId: I(BEN.userIdHex) }),
    ];
    expect(buildVirtualEntries("chat", input({ chatConversations: [dm], chatMessages: rows }))[0].group).toBe("Ben");
    const members = [{ conversationId: String(dm.id), userId: I(ANA.userIdHex) }, { conversationId: String(dm.id), userId: I(BEN.userIdHex) }];
    const only = [rows[0]];
    expect(buildVirtualEntries("chat", input({ chatConversations: [dm], chatMessages: only, chatMembers: members }))[0].group).toBe("Ben");
    expect(buildVirtualEntries("chat", input({ chatConversations: [dm], chatMessages: only }))[0].group).toBe("Ana");
    const CY = { id: uuid(), userIdHex: "cc".repeat(32), name: "Cy" };
    const three = [...members, { conversationId: String(dm.id), userId: I(CY.userIdHex) }];
    const group = buildVirtualEntries("chat", input({ members: [ANA, BEN, CY], chatConversations: [dm], chatMessages: only, chatMembers: three }));
    expect(group[0].group).toBe("Ben and Cy");
  });

  test("hidden on the store tablet", () => {
    const rows = [msg(conv, { attachmentUrl: "https://x.test/a.png", attachmentType: "image" })];
    expect(buildVirtualEntries("chat", input({ chatConversations: [conv], chatMessages: rows, storeIdentity: true }))).toEqual([]);
  });
});

describe("tasks", () => {
  const task = { id: U(uuid()), title: "Open the store" };
  const assignment = (memberId: string, patch: Record<string, unknown> = {}) => ({
    id: U(uuid()), organizationId: ORG, taskId: String(task.id), memberId, createdAt: T(1_000), ...patch,
  });

  test("evidence JSON plus the legacy link, de-duplicated, named and grouped by the task", () => {
    const row = assignment(ANA.id, {
      evidenceUrls: JSON.stringify([{ url: "https://x.test/1.jpg", type: "image/jpeg" }, { url: "https://x.test/2.mov", type: "video/quicktime" }]),
      evidenceUrl: "https://x.test/1.jpg",
      completedAt: MICROS(4_000),
    });
    const legacyOnly = assignment(ANA.id, { evidenceUrl: "https://x.test/3.png" });
    const entries = buildVirtualEntries("tasks", input({ roleTasks: [task], taskAssignments: [row, legacyOnly] }));
    const mine = entries.filter((e) => e.id.startsWith(String(row.id)));
    expect(mine.map((e) => [e.name, e.fileKind, e.group, e.updatedAt])).toEqual([
      ["Open the store · photo 1", "image", "Open the store", 4_000],
      ["Open the store · photo 2", "video", "Open the store", 4_000],
    ]);
    expect(mine.map((e) => e.key)).toEqual([`v:tasks:${String(row.id)}:1`, `v:tasks:${String(row.id)}:2`]);
    for (const e of entries) expect(previewParam(e.key)).toBe(e.key);
    const legacy = entries.find((e) => e.id.startsWith(String(legacyOnly.id)))!;
    expect([legacy.url, legacy.updatedAt, legacy.isMine]).toEqual(["https://x.test/3.png", 1_000, true]);
  });

  test("own rows by org_member id; a staff_member id matches nobody and shows to admins only", () => {
    const staffMemberId = uuid();
    const rows = [
      assignment(ANA.id, { evidenceUrl: "https://x.test/mine.png" }),
      assignment(BEN.id, { evidenceUrl: "https://x.test/bens.png" }),
      assignment(staffMemberId, { evidenceUrl: "https://x.test/legacy.png" }),
      assignment(ANA.id, { evidenceUrl: "https://x.test/other-org.png", organizationId: OTHER_ORG }),
    ];
    const own = buildVirtualEntries("tasks", input({ roleTasks: [task], taskAssignments: rows }));
    expect(own.map((e) => e.url)).toEqual(["https://x.test/mine.png"]);
    const admin = buildVirtualEntries("tasks", input({ roleTasks: [task], taskAssignments: rows, canViewAll: true }));
    expect(admin.map((e) => e.url).sort()).toEqual(["https://x.test/bens.png", "https://x.test/legacy.png", "https://x.test/mine.png"]);
    expect(admin.find((e) => e.url.endsWith("legacy.png"))!.ownerName).toBeNull();
  });

  test("a missing task still names its photos", () => {
    const entries = buildVirtualEntries("tasks", input({ taskAssignments: [assignment(ANA.id, { evidenceUrl: "https://x.test/a.png" })] }));
    expect([entries[0].name, entries[0].group]).toEqual(["Attachment · photo 1", ""]);
  });
});

describe("inventory, training, products, bugs", () => {
  test("inventory evidence for everyone who can see inventory; operator as owner", () => {
    const tx = { id: U(uuid()), organizationId: ORG, itemName: "Milk", operatorMemberId: BEN.id, createdAt: T(3_000),
      evidenceUrls: JSON.stringify([{ url: "https://x.test/m.jpg", type: "image/jpeg" }, "not a url"]) };
    const other = { ...tx, id: U(uuid()), organizationId: OTHER_ORG };
    const entries = buildVirtualEntries("inventory", input({ inventoryTransactions: [tx, other, { id: U(uuid()), organizationId: ORG, itemName: "x" }] }));
    expect(entries.map((e) => [e.name, e.group, e.ownerName, e.mimeType])).toEqual([["Milk · photo 1", "Milk", "Ben", "image/jpeg"]]);
  });

  test("training media: image/video by media type, a PDF by its extension", () => {
    const rows = [
      { id: U(uuid()), organizationId: ORG, text: "Knife safety", mediaUrl: "https://utfs.io/f/k", mediaType: "video", updatedAt: T(2_000) },
      { id: U(uuid()), organizationId: ORG, text: "", mediaUrl: "https://x.test/guide.pdf", updatedAt: T(1_000) },
      { id: U(uuid()), organizationId: ORG, text: "No media", updatedAt: T(1_000) },
    ];
    const entries = buildVirtualEntries("training", input({ trainingObjectives: rows }));
    expect(entries.map((e) => [e.name, e.fileKind, e.ownerMemberId])).toEqual([["Knife safety", "video", ""], ["Attachment", "pdf", ""]]);
  });

  test("product images", () => {
    const rows = [
      { id: U(uuid()), organizationId: ORG, name: "Latte", retailImageUrl: "https://x.test/latte.webp", updatedAt: T(1) },
      { id: U(uuid()), organizationId: ORG, name: "Plain", retailImageUrl: "" },
    ];
    expect(buildVirtualEntries("products", input({ inventoryItems: rows })).map((e) => [e.name, e.fileKind, e.mimeType])).toEqual([["Latte", "image", "image/webp"]]);
  });

  test("bug screenshots: your own, or all with the view power", () => {
    const rows = [
      { id: U(uuid()), organizationId: ORG, reporterMemberId: ANA.id, title: "Crash", screenshotUrl: "https://x.test/a.png", createdAt: T(2) },
      { id: U(uuid()), organizationId: ORG, reporterMemberId: BEN.id, title: "Typo", screenshotUrl: "https://x.test/b.png", createdAt: T(1) },
      { id: U(uuid()), organizationId: ORG, reporterMemberId: ANA.id, title: "None", screenshotUrl: "", createdAt: T(3) },
    ];
    expect(buildVirtualEntries("bugs", input({ bugReports: rows })).map((e) => e.name)).toEqual(["Crash"]);
    expect(buildVirtualEntries("bugs", input({ bugReports: rows, canViewAll: true })).map((e) => e.name)).toEqual(["Crash", "Typo"]);
  });
});

describe("profile", () => {
  const org = { id: U(ORG), logoUrl: "https://x.test/logo.png", createdAt: T(10) };
  const otherOrg = { id: U(OTHER_ORG), logoUrl: "https://x.test/other.png", createdAt: T(10) };
  const me = { identity: I(ANA.userIdHex), avatarUrl: "https://x.test/me.jpg", createdAt: T(20) };
  const ben = { identity: I(BEN.userIdHex), avatarUrl: "https://x.test/ben.jpg", createdAt: T(30) };

  test("the store logo and your own photo; the photo is left out on the store tablet", () => {
    const entries = buildVirtualEntries("profile", input({ organizations: [org, otherOrg], users: [me, ben] }));
    expect(entries.map((e) => [e.name, e.url, e.isMine])).toEqual([
      ["Your profile photo", "https://x.test/me.jpg", true],
      ["Store logo", "https://x.test/logo.png", false],
    ]);
    expect(entries.map((e) => e.key)).toEqual([`v:profile:${ANA.userIdHex}`, `v:profile:${ORG}`]);
    for (const e of entries) expect(previewParam(e.key)).toBe(e.key);
    const store = buildVirtualEntries("profile", input({ organizations: [org], users: [me], storeIdentity: true }));
    expect(store.map((e) => e.name)).toEqual(["Store logo"]);
  });
});

describe("forms", () => {
  const F1 = uuid();
  const F2 = uuid();
  const F3 = uuid();
  const form = (id: string, patch: Partial<VirtualFormInput["form"]> = {}): VirtualFormInput["form"] => ({
    id, organizationId: ORG, title: "Opening checklist", kind: "checklist", ownerMemberId: BEN.id, updatedAt: new Date(1_000), ...patch,
  });
  const meta = (patch: Partial<NonNullable<VirtualFormInput["meta"]>> = {}): NonNullable<VirtualFormInput["meta"]> => ({
    responseCount: 3, answerBytes: 1_200, fileBytes: 800, lastResponseAt: new Date(5_000), ...patch,
  });
  const formsInput = (forms: VirtualFormInput[], patch: Partial<VirtualInput> = {}) => input({
    forms,
    formHref: (id) => formEditHref(id, "responses"),
    labels: {
      untitledAttachment: "Attachment", storeLogo: "Store logo", profilePhoto: "Your profile photo", photoN: "{name} · photo {n}",
      untitledForm: "Untitled form", formKinds: { checklist: "Checklist", survey: "Survey" }, responsesN: "{n} responses",
    },
    ...patch,
  });

  test("one record per form whose counters the viewer can read, newest activity first", () => {
    const entries = buildVirtualEntries("forms", formsInput([
      { form: form(F1), meta: meta() },
      { form: form(F2, { title: " ", kind: "survey", ownerMemberId: ANA.id, updatedAt: new Date(9_000) }), meta: meta({ responseCount: 1, answerBytes: 10, fileBytes: 0, lastResponseAt: null }) },
      // No form_meta: not a Drive admin, so no entry.
      { form: form(F3), meta: null },
      { form: form(uuid(), { organizationId: OTHER_ORG }), meta: meta() },
    ]));
    expect(entries.map((e) => [e.key, e.name, e.group, e.note, e.sizeBytes, e.updatedAt, e.ownerName, e.isMine])).toEqual([
      [`v:forms:${F2}`, "Untitled form", "Survey", "1 responses", 10, 9_000, "Ana", true],
      [`v:forms:${F1}`, "Opening checklist", "Checklist", "3 responses", 2_000, 5_000, "Ben", false],
    ]);
    const [, first] = entries as [VirtualEntry, VirtualEntry];
    expect(first.href).toBe(`/manager/forms/edit?id=${F1}&view=responses`);
    expect(first.url).toBe("");
    expect(first.access.canOpen).toBe(true);
    expect(first.access.canDownload).toBe(false);
    expect(first.originRoute).toBe("/manager/forms");
    expect(isRecordEntry(first)).toBe(true);
    for (const e of entries) expect(previewParam(e.key)).toBe(e.key);
  });

  test("no forms, or no link builder: no entries; file links are not records", () => {
    expect(buildVirtualEntries("forms", input())).toEqual([]);
    expect(buildVirtualEntries("forms", input({ forms: [{ form: form(F1), meta: meta() }] }))).toEqual([]);
    const bug = { id: U(uuid()), organizationId: ORG, reporterMemberId: ANA.id, title: "Crash", screenshotUrl: "https://x.test/a.png", createdAt: T(2) };
    const [link] = buildVirtualEntries("bugs", input({ bugReports: [bug] }));
    expect(link && isRecordEntry(link)).toBe(false);
  });
});
