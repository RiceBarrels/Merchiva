"use client";

import { useMemo, useState } from "react";
import { adminCall, formatTs } from "@/lib/merchiva-admin/client";
import { useAdminQuery } from "../use-admin-query";
import { Badge, DataTable, ErrorBanner, Panel, btnCls, btnDangerCls, btnGhostCls, inputCls, type Column } from "../ui";
import { Field, FormActions, FormRow, IdCell, StatusBadge, orgQuery, toInt, useAction, useOrgMembers } from "./shared";
import type { TrainingDayGradeRow, TrainingDayRow, TrainingObjectiveGradeRow, TrainingObjectiveRow, TrainingReviewRequestRow } from "./types";

type Section = "curriculum" | "grades" | "reviews";

interface DayForm {
  dayNumber: string;
  title: string;
  description: string;
  sortOrder: string;
}
interface ObjectiveForm {
  dayId: string;
  text: string;
  mediaUrl: string;
  mediaType: string;
  sortOrder: string;
}

export function TrainingTab({ orgId }: { orgId: string }) {
  const members = useOrgMembers(orgId);
  const days = useAdminQuery<TrainingDayRow>(orgQuery("training_day", orgId));
  const objectives = useAdminQuery<TrainingObjectiveRow>(orgQuery("training_objective", orgId));
  const dayGrades = useAdminQuery<TrainingDayGradeRow>(orgQuery("training_day_grade", orgId));
  const objGrades = useAdminQuery<TrainingObjectiveGradeRow>(orgQuery("training_objective_grade", orgId));
  const reviews = useAdminQuery<TrainingReviewRequestRow>(orgQuery("training_review_request", orgId));
  const action = useAction();

  const [section, setSection] = useState<Section>("curriculum");

  const sortedDays = useMemo(() => [...days.rows].sort((a, b) => a.sortOrder - b.sortOrder || a.dayNumber - b.dayNumber), [days.rows]);
  const dayById = useMemo(() => new Map(sortedDays.map((d) => [d.id, d])), [sortedDays]);
  const objectivesByDay = useMemo(() => {
    const m = new Map<string, TrainingObjectiveRow[]>();
    for (const o of objectives.rows) {
      const list = m.get(o.dayId) ?? [];
      list.push(o);
      m.set(o.dayId, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [objectives.rows]);

  const dayLabel = (id: string) => {
    const d = dayById.get(id);
    return d ? `Day ${d.dayNumber} · ${d.title}` : id;
  };

  // ── Curriculum ─────────────────────────────────────────────────────────────
  const [dayOpen, setDayOpen] = useState(false);
  const [dayEditing, setDayEditing] = useState<TrainingDayRow | null>(null);
  const [dayForm, setDayForm] = useState<DayForm>({ dayNumber: "1", title: "", description: "", sortOrder: "0" });
  const [objOpen, setObjOpen] = useState(false);
  const [objEditing, setObjEditing] = useState<TrainingObjectiveRow | null>(null);
  const [objForm, setObjForm] = useState<ObjectiveForm>({ dayId: "", text: "", mediaUrl: "", mediaType: "", sortOrder: "0" });

  function reloadCurriculum() {
    days.reload();
    objectives.reload();
    dayGrades.reload();
    objGrades.reload();
    reviews.reload();
  }

  async function submitDay(e: React.FormEvent) {
    e.preventDefault();
    const args = { organizationId: orgId, dayNumber: toInt(dayForm.dayNumber, 1), title: dayForm.title.trim(), description: dayForm.description.trim() || null, sortOrder: toInt(dayForm.sortOrder) };
    const ok = dayEditing
      ? await action.run("day", () => adminCall("updateTrainingDay", { ...args, dayId: dayEditing.id }), { after: days.reload })
      : await action.run("day", () => adminCall("addTrainingDay", args), { after: days.reload });
    if (ok) setDayOpen(false);
  }

  async function submitObjective(e: React.FormEvent) {
    e.preventDefault();
    const args = { organizationId: orgId, text: objForm.text.trim(), mediaUrl: objForm.mediaUrl.trim() || null, mediaType: objForm.mediaType.trim() || null, sortOrder: toInt(objForm.sortOrder) };
    const ok = objEditing
      ? await action.run("obj", () => adminCall("updateTrainingObjective", { ...args, objectiveId: objEditing.id }), { after: objectives.reload })
      : await action.run("obj", () => adminCall("addTrainingObjective", { ...args, dayId: objForm.dayId }), { after: objectives.reload });
    if (ok) setObjOpen(false);
  }

  // ── Grades ─────────────────────────────────────────────────────────────────
  const [traineeId, setTraineeId] = useState("");
  const [ratingDraft, setRatingDraft] = useState<Record<string, string>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const traineeDayGrades = useMemo(() => new Map(dayGrades.rows.filter((g) => g.traineeId === traineeId).map((g) => [g.dayId, g])), [dayGrades.rows, traineeId]);
  const traineeObjGrades = useMemo(() => new Map(objGrades.rows.filter((g) => g.traineeId === traineeId).map((g) => [g.objectiveId, g])), [objGrades.rows, traineeId]);
  const traineesWithGrades = useMemo(() => {
    const ids = new Set<string>();
    for (const g of dayGrades.rows) ids.add(g.traineeId);
    for (const g of objGrades.rows) ids.add(g.traineeId);
    for (const r of reviews.rows) ids.add(r.traineeId);
    return ids;
  }, [dayGrades.rows, objGrades.rows, reviews.rows]);

  function gradeObjective(objectiveId: string, status: "pass" | "fail") {
    void action.run(`og:${objectiveId}`, () => adminCall("gradeTrainingObjective", { organizationId: orgId, traineeId, objectiveId, status, comment: null }), { after: objGrades.reload });
  }
  function clearObjective(objectiveId: string) {
    void action.run(`og:${objectiveId}`, () => adminCall("clearTrainingObjectiveGrade", { organizationId: orgId, traineeId, objectiveId }), { after: objGrades.reload });
  }
  function gradeDay(dayId: string) {
    const rating = toInt(ratingDraft[dayId] ?? String(traineeDayGrades.get(dayId)?.rating ?? 0));
    if (rating < 1 || rating > 5) {
      action.setError("Rating must be 1–5");
      return;
    }
    const comment = (commentDraft[dayId] ?? traineeDayGrades.get(dayId)?.comment ?? "").trim() || null;
    void action.run(`dg:${dayId}`, () => adminCall("gradeTrainingDay", { organizationId: orgId, traineeId, dayId, rating, comment }), {
      after: () => {
        dayGrades.reload();
        reviews.reload();
      },
    });
  }

  // ── Reviews ────────────────────────────────────────────────────────────────
  const [reviewFilter, setReviewFilter] = useState("pending");
  const visibleReviews = useMemo(
    () => [...reviews.rows].filter((r) => reviewFilter === "all" || r.status === reviewFilter).sort((a, b) => b.createdAt - a.createdAt),
    [reviews.rows, reviewFilter],
  );

  const reviewCols: Column<TrainingReviewRequestRow>[] = [
    { key: "trainee", header: "Trainee", render: (r) => <span className="font-medium">{members.nameOf(r.traineeId)}</span> },
    { key: "day", header: "Day", render: (r) => dayLabel(r.dayId) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "createdAt", header: "Requested", className: "text-stone-500", render: (r) => formatTs(r.createdAt) },
    { key: "resolvedAt", header: "Resolved", className: "text-stone-500", render: (r) => formatTs(r.resolvedAt) },
    { key: "resolvedBy", header: "By", render: (r) => members.nameOfUser(r.resolvedBy) },
    { key: "id", header: "Id", render: (r) => <IdCell id={r.id} /> },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (r) => (
        <span className="inline-flex gap-1.5">
          <button
            type="button"
            className={btnGhostCls}
            onClick={() => {
              setTraineeId(r.traineeId);
              setSection("grades");
            }}
          >
            Grade
          </button>
          {r.status === "pending" && (
            <button
              type="button"
              className={btnGhostCls}
              disabled={action.busy === `rv:${r.id}`}
              onClick={() => void action.run(`rv:${r.id}`, () => adminCall("resolveTrainingReview", { organizationId: orgId, requestId: r.id }), { after: reviews.reload })}
            >
              Resolve
            </button>
          )}
        </span>
      ),
    },
  ];

  const sectionBtn = (s: Section, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setSection(s)}
      className={`rounded-[0.15rem] border px-2.5 py-1 text-[12px] font-medium ${section === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white hover:bg-stone-50"}`}
    >
      {label} <span className="font-mono opacity-70">{count}</span>
    </button>
  );

  const anyError = days.error ?? objectives.error ?? dayGrades.error ?? objGrades.error ?? reviews.error ?? members.error ?? action.error;
  const loadingCurriculum = days.loading || objectives.loading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {sectionBtn("curriculum", "Curriculum", sortedDays.length)}
        {sectionBtn("grades", "Grades", traineesWithGrades.size)}
        {sectionBtn("reviews", "Review requests", reviews.rows.filter((r) => r.status === "pending").length)}
        <button type="button" className={`${btnGhostCls} ml-auto`} onClick={reloadCurriculum}>
          Refresh all
        </button>
      </div>

      {section === "curriculum" && (
        <Panel
          title={`Training days · ${sortedDays.length} · ${objectives.rows.length} objectives`}
          actions={
            <>
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  setDayEditing(null);
                  setDayForm({ dayNumber: String(sortedDays.length + 1), title: "", description: "", sortOrder: String(sortedDays.length) });
                  setDayOpen(true);
                }}
              >
                Add day
              </button>
            </>
          }
        >
          <ErrorBanner message={anyError} />
          {dayOpen && (
            <form onSubmit={submitDay}>
              <FormRow>
                <Field label="Day number">
                  <input type="number" className={inputCls} value={dayForm.dayNumber} onChange={(e) => setDayForm({ ...dayForm, dayNumber: e.target.value })} required />
                </Field>
                <Field label="Title">
                  <input className={inputCls} value={dayForm.title} onChange={(e) => setDayForm({ ...dayForm, title: e.target.value })} required />
                </Field>
                <Field label="Description">
                  <input className={inputCls} value={dayForm.description} onChange={(e) => setDayForm({ ...dayForm, description: e.target.value })} />
                </Field>
                <Field label="Sort order">
                  <input type="number" className={inputCls} value={dayForm.sortOrder} onChange={(e) => setDayForm({ ...dayForm, sortOrder: e.target.value })} />
                </Field>
              </FormRow>
              <FormActions>
                <button type="submit" className={btnCls} disabled={action.busy === "day"}>
                  {action.busy === "day" ? "Saving…" : dayEditing ? "Update day" : "Add day"}
                </button>
                <button type="button" className={btnGhostCls} onClick={() => setDayOpen(false)}>
                  Cancel
                </button>
              </FormActions>
            </form>
          )}
          {objOpen && (
            <form onSubmit={submitObjective}>
              <FormRow>
                <Field label="Day">
                  <select className={inputCls} value={objForm.dayId} disabled={objEditing !== null} onChange={(e) => setObjForm({ ...objForm, dayId: e.target.value })} required>
                    {sortedDays.map((d) => (
                      <option key={d.id} value={d.id}>
                        Day {d.dayNumber} · {d.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Objective" className="md:col-span-2">
                  <input className={inputCls} value={objForm.text} onChange={(e) => setObjForm({ ...objForm, text: e.target.value })} required />
                </Field>
                <Field label="Sort order">
                  <input type="number" className={inputCls} value={objForm.sortOrder} onChange={(e) => setObjForm({ ...objForm, sortOrder: e.target.value })} />
                </Field>
                <Field label="Media URL" className="md:col-span-3">
                  <input className={`${inputCls} font-mono`} value={objForm.mediaUrl} onChange={(e) => setObjForm({ ...objForm, mediaUrl: e.target.value })} />
                </Field>
                <Field label="Media type">
                  <select className={inputCls} value={objForm.mediaType} onChange={(e) => setObjForm({ ...objForm, mediaType: e.target.value })}>
                    <option value="">none</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                  </select>
                </Field>
              </FormRow>
              <FormActions>
                <button type="submit" className={btnCls} disabled={action.busy === "obj"}>
                  {action.busy === "obj" ? "Saving…" : objEditing ? "Update objective" : "Add objective"}
                </button>
                <button type="button" className={btnGhostCls} onClick={() => setObjOpen(false)}>
                  Cancel
                </button>
              </FormActions>
            </form>
          )}
          {loadingCurriculum && sortedDays.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-stone-500">Loading…</div>
          ) : sortedDays.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-stone-500">No training days defined</div>
          ) : (
            <div className="divide-y divide-stone-200">
              {sortedDays.map((d) => {
                const objs = objectivesByDay.get(d.id) ?? [];
                return (
                  <div key={d.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Badge>Day {d.dayNumber}</Badge>
                        <span className="text-[13px] font-semibold">{d.title}</span>
                        {d.description && <span className="text-[12px] text-stone-500">{d.description}</span>}
                        <IdCell id={d.id} />
                      </div>
                      <span className="inline-flex gap-1.5">
                        <button
                          type="button"
                          className={btnGhostCls}
                          onClick={() => {
                            setObjEditing(null);
                            setObjForm({ dayId: d.id, text: "", mediaUrl: "", mediaType: "", sortOrder: String(objs.length) });
                            setObjOpen(true);
                            setDayOpen(false);
                          }}
                        >
                          Add objective
                        </button>
                        <button
                          type="button"
                          className={btnGhostCls}
                          onClick={() => {
                            setDayEditing(d);
                            setDayForm({ dayNumber: String(d.dayNumber), title: d.title, description: d.description ?? "", sortOrder: String(d.sortOrder) });
                            setDayOpen(true);
                            setObjOpen(false);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={btnDangerCls}
                          disabled={action.busy === `delday:${d.id}`}
                          onClick={() =>
                            void action.run(`delday:${d.id}`, () => adminCall("deleteTrainingDay", { organizationId: orgId, dayId: d.id }), {
                              confirm: `Delete "Day ${d.dayNumber} · ${d.title}"? Its objectives, grades and review requests are deleted too.`,
                              after: reloadCurriculum,
                            })
                          }
                        >
                          Delete
                        </button>
                      </span>
                    </div>
                    {objs.length === 0 ? (
                      <div className="px-4 py-2 text-[12px] text-stone-400">No objectives</div>
                    ) : (
                      <table className="w-full text-[13px]">
                        <tbody>
                          {objs.map((o) => (
                            <tr key={o.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                              <td className="w-10 px-4 py-1.5 font-mono text-[11px] text-stone-400">{o.sortOrder}</td>
                              <td className="px-3 py-1.5">{o.text}</td>
                              <td className="px-3 py-1.5 text-stone-500">
                                {o.mediaUrl ? (
                                  <a href={o.mediaUrl} target="_blank" rel="noreferrer" className="underline">
                                    {o.mediaType ?? "media"}
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                <IdCell id={o.id} />
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <span className="inline-flex gap-1.5">
                                  <button
                                    type="button"
                                    className={btnGhostCls}
                                    onClick={() => {
                                      setObjEditing(o);
                                      setObjForm({ dayId: o.dayId, text: o.text, mediaUrl: o.mediaUrl ?? "", mediaType: o.mediaType ?? "", sortOrder: String(o.sortOrder) });
                                      setObjOpen(true);
                                      setDayOpen(false);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={btnDangerCls}
                                    disabled={action.busy === `delobj:${o.id}`}
                                    onClick={() =>
                                      void action.run(`delobj:${o.id}`, () => adminCall("deleteTrainingObjective", { organizationId: orgId, objectiveId: o.id }), {
                                        confirm: `Delete objective "${o.text}"? Its grades are deleted too.`,
                                        after: () => {
                                          objectives.reload();
                                          objGrades.reload();
                                        },
                                      })
                                    }
                                  >
                                    Delete
                                  </button>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {section === "grades" && (
        <Panel
          title="Trainee grades"
          actions={
            <select className={`${inputCls} w-auto py-1`} value={traineeId} onChange={(e) => setTraineeId(e.target.value)}>
              <option value="">— trainee —</option>
              {members.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {traineesWithGrades.has(m.id) ? " ●" : ""}
                </option>
              ))}
            </select>
          }
        >
          <ErrorBanner message={anyError} />
          {!traineeId ? (
            <div className="px-4 py-8 text-center text-[13px] text-stone-500">Select a trainee. Members with existing grades or review requests are marked ●.</div>
          ) : sortedDays.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-stone-500">No curriculum to grade against.</div>
          ) : (
            <div className="divide-y divide-stone-200">
              {sortedDays.map((d) => {
                const objs = objectivesByDay.get(d.id) ?? [];
                const dg = traineeDayGrades.get(d.id);
                const passed = objs.filter((o) => traineeObjGrades.get(o.id)?.status === "pass").length;
                const failed = objs.filter((o) => traineeObjGrades.get(o.id)?.status === "fail").length;
                return (
                  <div key={d.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-50 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Badge>Day {d.dayNumber}</Badge>
                        <span className="text-[13px] font-semibold">{d.title}</span>
                        <span className="font-mono text-[11px] text-stone-500">
                          {passed}/{objs.length} pass{failed ? ` · ${failed} fail` : ""}
                        </span>
                        {dg ? (
                          <Badge tone="ok">
                            signed off {dg.rating}/5 · {formatTs(dg.gradedAt)}
                          </Badge>
                        ) : (
                          <Badge tone="warn">not signed off</Badge>
                        )}
                      </div>
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          gradeDay(d.id);
                        }}
                      >
                        <select
                          className={`${inputCls} w-auto py-1`}
                          value={ratingDraft[d.id] ?? String(dg?.rating ?? "")}
                          onChange={(e) => setRatingDraft({ ...ratingDraft, [d.id]: e.target.value })}
                        >
                          <option value="">rating</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={String(n)}>
                              {n} / 5
                            </option>
                          ))}
                        </select>
                        <input
                          className={`${inputCls} w-48 py-1`}
                          placeholder="comment"
                          value={commentDraft[d.id] ?? dg?.comment ?? ""}
                          onChange={(e) => setCommentDraft({ ...commentDraft, [d.id]: e.target.value })}
                        />
                        <button type="submit" className={btnCls} disabled={action.busy === `dg:${d.id}`}>
                          {dg ? "Re-grade day" : "Sign off day"}
                        </button>
                      </form>
                    </div>
                    {objs.length > 0 && (
                      <table className="w-full text-[13px]">
                        <tbody>
                          {objs.map((o) => {
                            const g = traineeObjGrades.get(o.id);
                            const busy = action.busy === `og:${o.id}`;
                            return (
                              <tr key={o.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                                <td className="w-10 px-4 py-1.5 font-mono text-[11px] text-stone-400">{o.sortOrder}</td>
                                <td className="px-3 py-1.5">{o.text}</td>
                                <td className="px-3 py-1.5">{g ? <StatusBadge status={g.status} /> : <span className="text-stone-300">ungraded</span>}</td>
                                <td className="px-3 py-1.5 text-[12px] text-stone-500">{g ? `${formatTs(g.gradedAt)}${g.comment ? ` · ${g.comment}` : ""}` : ""}</td>
                                <td className="px-3 py-1.5 text-right">
                                  <span className="inline-flex gap-1.5">
                                    <button type="button" className={btnGhostCls} disabled={busy || g?.status === "pass"} onClick={() => gradeObjective(o.id, "pass")}>
                                      Pass
                                    </button>
                                    <button type="button" className={btnDangerCls} disabled={busy || g?.status === "fail"} onClick={() => gradeObjective(o.id, "fail")}>
                                      Fail
                                    </button>
                                    {g && (
                                      <button type="button" className={btnGhostCls} disabled={busy} onClick={() => clearObjective(o.id)}>
                                        Clear
                                      </button>
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {section === "reviews" && (
        <Panel
          title={`Review requests · ${visibleReviews.length}`}
          actions={
            <select className={`${inputCls} w-auto py-1`} value={reviewFilter} onChange={(e) => setReviewFilter(e.target.value)}>
              <option value="pending">pending</option>
              <option value="resolved">resolved</option>
              <option value="all">all</option>
            </select>
          }
        >
          <ErrorBanner message={anyError} />
          <DataTable columns={reviewCols} rows={visibleReviews} loading={reviews.loading} rowKey={(r) => r.id} empty="No review requests" />
          <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-stone-500">Signing off a day from the Grades section also resolves that trainee&apos;s pending request for it.</div>
        </Panel>
      )}
    </div>
  );
}
