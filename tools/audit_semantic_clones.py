#!/usr/bin/env python3
# Snapvere by Brendigo
"""Report structural clone candidates; never delete or equate code automatically.

Python: normalized function ASTs, preserving control flow, call attributes and
literal values while normalizing argument/local names. Other languages:
normalized token windows preserving operators, keywords and member identifiers.
These are Type-2/structural similarity heuristics, not semantic equivalence.
"""
import argparse
import ast
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = {".py", ".rs", ".ts", ".tsx", ".js", ".mjs", ".php", ".c", ".h"}
SCOPE = ("apps/desktop/src/", "apps/desktop/src-tauri/src/",
         "apps/desktop/src-tauri/native/", "apps/desktop/src-tauri/examples/",
         "apps/desktop/tests/", "tools/", "deploy/", "snpv.re/", "site/")
KEYWORDS = set("""
if else elif for while do switch case default break continue return throw try
catch finally class struct enum trait impl fn function async await match let const
var mut pub private public protected static import export from as use mod type
interface new this self super true false null nil none Some None Ok Err
unsafe extern loop in of is not and or yield where sizeof typeof void int bool
string number float double char unsigned signed long short auto ref move
""".split())
TOKEN = re.compile(
    r'''//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|'''
    r'''[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+(?:\.[0-9]+)?|::|->|=>|==|!=|<=|>=|&&|\|\||'''
    r'''[^\s]'''
)


class Normalize(ast.NodeTransformer):
    def visit_Name(self, node):
        node.id = "identifier"
        return node

    def visit_arg(self, node):
        node.arg = "argument"
        return self.generic_visit(node)

    def visit_FunctionDef(self, node):
        node.name = "function"
        return self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef


def python_signatures(source):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and sum(1 for _ in ast.walk(node)) >= 60:
            # Clone the subtree: normalization must not mutate nested functions
            # while the original AST is traversed.
            import copy
            normalized = Normalize().visit(copy.deepcopy(node))
            yield node.lineno, ast.dump(normalized, include_attributes=False)


def token_signatures(source):
    tokens = []
    line = 1
    last = 0
    previous = ""
    for match in TOKEN.finditer(source):
        line += source.count("\n", last, match.start())
        value = match.group()
        start_line = line
        line += value.count("\n")
        last = match.end()
        if value.startswith(("//", "/*")):
            continue
        if value[0] in "\"'":
            value = "literal"
        elif value[0].isdigit():
            value = "number"
        elif re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", value) and value not in KEYWORDS and previous not in (".", "::", "->"):
            value = "identifier"
        tokens.append((start_line, value))
        previous = value
    # Long windows avoid trivial brace/guard matches. Stride limits repeated
    # overlapping results; changed token alignment may still hide clones.
    for index in range(0, len(tokens) - 119, 12):
        window = tokens[index:index + 120]
        if len({value for _, value in window}) >= 18:
            yield window[0][0], " ".join(value for _, value in window)


def analyze(root, paths):
    groups = defaultdict(list)
    scanned = defaultdict(int)
    failures = []
    for path in sorted(paths):
        suffix = path.suffix
        if suffix not in LANGUAGES or not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(root).as_posix()
        if not relative.startswith(SCOPE):
            continue
        # Locale string catalogs are not executable logic. Other language
        # modules containing logic are retained, including translation helpers.
        if path.name.startswith("i18n") and suffix in {".ts", ".tsx"}:
            continue
        source = path.read_text(encoding="utf-8-sig")
        scanned[suffix] += 1
        method = "python-ast" if suffix == ".py" else "normalized-token-window"
        try:
            signatures = python_signatures(source) if suffix == ".py" else token_signatures(source)
            for line, shape in signatures:
                digest = hashlib.sha256(shape.encode()).hexdigest()
                groups[(method, digest)].append({"path": relative, "line": line})
        except SyntaxError as exc:
            failures.append({"path": relative, "line": exc.lineno, "error": exc.msg})
    candidates = [
        {"method": method, "locations": locations}
        for (method, _), locations in groups.items()
        if len({entry["path"] for entry in locations}) > 1
    ]
    return {"scanned": dict(scanned), "parse_failures": failures,
            "candidate_count": len(candidates), "candidates": candidates}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    paths = [ROOT / p for p in subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0") if p]
    report = analyze(ROOT, paths)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Structural clone audit: {sum(report['scanned'].values())} files; "
          f"{report['candidate_count']} cross-file candidates; {len(report['parse_failures'])} parse failures")
    if report["parse_failures"]:
        raise SystemExit("Python AST parsing incomplete")
    print("Candidates require manual semantic review; no automatic deletion.")


if __name__ == "__main__":
    main()
