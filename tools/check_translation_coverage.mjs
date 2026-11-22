#!/usr/bin/env node
// Snapvere by Brendigo
/* Audit all static translation arguments in actual production TS/TSX modules.
 * Unlike regular-expression checks, this includes ternary and ?? branches. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LANGUAGES, hasTranslationKey, translate } from "../apps/desktop/src/lib/i18n.ts";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/desktop");
const src = path.join(project, "src");
const requireTs = createRequire(path.join(project, "package.json"));
const loaded = requireTs("@typescript/typescript6");
const ts = loaded.default ?? loaded;
const problems = [];
const keys = new Set();
let files = 0;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(ent => ent.isDirectory() ? walk(path.join(dir, ent.name)) : [path.join(dir, ent.name)]);
}
function literalKeys(node) {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literalKeys(node.expression);
  if (ts.isConditionalExpression(node))
    return [...literalKeys(node.whenTrue), ...literalKeys(node.whenFalse)];
  if (ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind))
    return [...literalKeys(node.left), ...literalKeys(node.right)];
  return [];
}
for (const file of walk(src).filter(f => /\.tsx?$/.test(f) && !f.endsWith(".d.ts"))) {
  files++;
  const code = fs.readFileSync(file, "utf8");
  const node = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(cursor) {
    if (ts.isCallExpression(cursor) && ts.isIdentifier(cursor.expression)
        && cursor.expression.text === "t" && cursor.arguments.length) {
      for (const key of literalKeys(cursor.arguments[0])) {
        keys.add(key);
        if (!hasTranslationKey(key)) {
          problems.push(path.relative(src, file) + ": missing key: " + key);
          continue;
        }
        for (const { code: lang } of LANGUAGES)
          if (!translate(lang, key).trim()) problems.push(lang + ": empty translation: " + key);
      }
    }
    ts.forEachChild(cursor, visit);
  }
  visit(node);
}

// The dedicated update notice uses its own localized 10-field copy table.
// Validate the complete structured table instead of only the common t() catalog.
const noticePath = path.join(src, "components/UpdateNotice.tsx");
const noticeTree = ts.createSourceFile(noticePath, fs.readFileSync(noticePath, "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visitVariable(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      (node.name.text === "en" || node.name.text === "words") &&
      node.initializer && ts.isObjectLiteralExpression(node.initializer))
    declarations.set(node.name.text, node.initializer);
  ts.forEachChild(node, visitVariable);
}
visitVariable(noticeTree);
function objectProperties(obj) {
  if (!obj) return new Map();
  return new Map(obj.properties.filter(ts.isPropertyAssignment)
    .map(prop => [prop.name.getText(noticeTree).replace(/^["']|["']$/g, ""), prop.initializer]));
}
const base = objectProperties(declarations.get("en"));
const locales = objectProperties(declarations.get("words"));
if (base.size !== 10) problems.push("UpdateNotice must have 10 English message fields");
for (const { code } of LANGUAGES) {
  if (code === "en") continue;
  const translated = locales.get(code);
  if (!translated || !ts.isObjectLiteralExpression(translated)) {
    problems.push("UpdateNotice missing locale: " + code);
    continue;
  }
  const fields = objectProperties(translated);
  for (const key of base.keys()) {
    const value = fields.get(key);
    if (!value || !ts.isStringLiteralLike(value) || !value.text.trim())
      problems.push("UpdateNotice " + code + " missing field: " + key);
  }
  if (fields.size !== base.size)
    problems.push("UpdateNotice " + code + " has an unexpected number of fields");
}
if (problems.length) {
  console.error("Localization audit violations:\n" + problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Localization audit: " + keys.size + " static keys in " + files +
    " modules; 12 languages and 10 update-notice strings per locale");
}
