// Combines the parallel coverage.py data files under coverage/python/raw,
// prints the text report, writes a JSON report, and enforces 99% statements
// and branches per measured file.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(".");
const rawDirectory = join(root, "coverage/python/raw");
const dataFile = join(rawDirectory, ".coverage");
const reportDirectory = join(root, "coverage/python");
const jsonFile = join(reportDirectory, "coverage-final.json");

const include = [
	"vite-fastapi-ai-sdk/backend/main.py",
	"session-fork/main.py",
];

const coverage = (...args) => {
	const result = spawnSync(
		"uvx",
		["--from", "coverage==7.16.2", "coverage", ...args],
		{
			cwd: root,
			env: { ...process.env, COVERAGE_FILE: dataFile },
			encoding: "utf8",
		},
	);
	if (result.status !== 0)
		throw new Error(`coverage ${args.join(" ")} failed: ${result.stderr}`);
	return result.stdout;
};

coverage("combine", "--keep", rawDirectory);
const report = coverage("report", "-m");
process.stdout.write(report);
mkdirSync(reportDirectory, { recursive: true });
writeFileSync(join(reportDirectory, "report.txt"), report);
coverage("json", "-o", jsonFile);

const files = JSON.parse(readFileSync(jsonFile, "utf8")).files;
const percentage = (covered, missing) =>
	covered + missing === 0 ? 100 : (covered / (covered + missing)) * 100;
for (const file of include) {
	const summary = (files[file] ?? files[join(root, file)])?.summary;
	if (!summary) {
		console.error(`ERROR: no coverage data for ${file}`);
		process.exitCode = 1;
		continue;
	}
	const metrics = {
		statements: percentage(summary.covered_lines, summary.missing_lines),
		branches: percentage(summary.covered_branches, summary.missing_branches),
	};
	for (const [metric, pct] of Object.entries(metrics)) {
		if (pct < 99) {
			console.error(
				`ERROR: Coverage for ${metric} (${pct}%) in ${file} does not meet threshold (99%)`,
			);
			process.exitCode = 1;
		}
	}
}
