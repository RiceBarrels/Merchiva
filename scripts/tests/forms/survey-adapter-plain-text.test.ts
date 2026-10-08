// lib/forms/survey-adapter.ts: author text reaches the real renderer model as plain text. No markdown or HTML
// (no `onTextMarkdown` handler), and no `{name}` substitution of answers or built-ins like `{locale}`.

import { describe, expect, test } from "bun:test";
import { Model } from "survey-core";
import { toSurveyJson } from "@/lib/forms/survey-adapter";
import type { FormDefinitionV1, Question } from "@/lib/forms/types";

const t = (key: string) => `T(${key})`;
const WJ = "⁠";
const visible = (s: string) => s.replaceAll(WJ, "");

const Q1 = "q_000000000001";
const Q2 = "q_000000000002";
const Q3 = "q_000000000003";

const questions: Question[] = [
  { id: Q1, type: "short_text", title: "<img src=x onerror=alert(1)>", required: false, help: "**bold** <i>h</i>" },
  { id: Q2, type: "short_text", title: `Echo {${Q1}} / {locale} / {pageno} / {unknown}`, required: false },
  { id: Q3, type: "dropdown", title: "Pick", required: false, options: [{ id: "o_00000001", label: "{locale} <b>x</b>" }] },
];
const def: FormDefinitionV1 = { v: 1, title: "{locale} <b>T</b>", description: "", questions, settings: { confirmation: "" } };

describe("author text is plain text in the renderer", () => {
  const model = new Model(toSurveyJson(def, { locale: "en", mode: "fill", t, layout: "single" }));
  model.setValue(Q1, "<b>answer</b>");

  test("titles and help are never HTML", () => {
    for (const q of model.getAllQuestions()) {
      expect(q.locTitle.hasHtml).toBe(false);
      expect(q.locDescription.hasHtml).toBe(false);
    }
    expect(model.locTitle.hasHtml).toBe(false);
    expect(visible(model.getQuestionByName(Q1).locTitle.textOrHtml)).toBe("<img src=x onerror=alert(1)>");
    expect(visible(model.getQuestionByName(Q1).locDescription.textOrHtml)).toBe("**bold** <i>h</i>");
  });

  test("braces stay literal: no answer or built-in is substituted", () => {
    expect(visible(model.getQuestionByName(Q2).locTitle.textOrHtml)).toBe(`Echo {${Q1}} / {locale} / {pageno} / {unknown}`);
    expect(visible(model.locTitle.textOrHtml)).toBe("{locale} <b>T</b>");
    const choice = model.getQuestionByName(Q3).choices[0] as { locText: { textOrHtml: string; hasHtml: boolean } };
    expect(visible(choice.locText.textOrHtml)).toBe("{locale} <b>x</b>");
    expect(choice.locText.hasHtml).toBe(false);
  });
});
